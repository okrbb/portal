// === MODUL PRE AUTENTIFIKÁCIU ===

import { store } from './store.js';
import { db, auth } from './config.js';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    reauthenticateWithCredential,
    updatePassword,
    EmailAuthProvider,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
} from 'firebase/auth';
import {
    collection,
    query,
    where,
    limit,
    getDocs,
    getDoc,
    doc
} from 'firebase/firestore';
import { logUserAction, updateLogsUser } from './logs_module.js';
import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';
import { DEMO_CONFIG, isDemoUser, activateDemoMode } from './demo_mode.js';
import { ADMIN_EMAIL } from './constants.js';
import { IDs } from './id-registry.js';

/**
 * Trieda na správu autentifikácie.
 */
export class AuthManager {
    constructor() {
        this.loginOverlay = document.getElementById(IDs.AUTH.OVERLAY);
        this.loginForm = document.getElementById(IDs.AUTH.FORM);
        this.emailInput = document.getElementById(IDs.AUTH.EMAIL_INPUT);
        this.passwordInput = document.getElementById(IDs.AUTH.PASSWORD_INPUT);
        this.loginErrorMsg = document.getElementById(IDs.AUTH.ERROR_MSG);
        this.logoutBtn = document.getElementById(IDs.NAV.LOGOUT_BTN);
        this.reloadBtn = document.getElementById(IDs.NAV.RELOAD_BTN);
        this.changePassBtn = document.getElementById(IDs.NAV.CHANGE_PASSWORD_BTN);
        this.changePassModal = document.getElementById(IDs.AUTH_MODALS.CHANGE_PASSWORD_MODAL);
        this.closePassModalBtn = document.getElementById(IDs.AUTH_MODALS.CLOSE_PASSWORD_MODAL);
        this.changePassForm = document.getElementById(IDs.AUTH_MODALS.CHANGE_PASSWORD_FORM);
        this.passErrorMsg = document.getElementById(IDs.AUTH_MODALS.PASSWORD_ERROR_MSG);
        this.forgotLink = document.getElementById(IDs.AUTH.FORGOT_LINK);
        this.forgotModal = document.getElementById(IDs.AUTH_MODALS.FORGOT_PASSWORD_MODAL);
        this.closeForgotModalBtn = document.getElementById(IDs.AUTH_MODALS.CLOSE_FORGOT_MODAL);
        this.forgotForm = document.getElementById(IDs.AUTH_MODALS.FORGOT_PASSWORD_FORM);
        this.forgotErrorMsg = document.getElementById(IDs.AUTH_MODALS.FORGOT_ERROR_MSG);
        this.emailInputLogin = document.getElementById(IDs.AUTH.EMAIL_INPUT);
        this.forgotEmailInput = document.getElementById(IDs.AUTH_MODALS.FORGOT_EMAIL);
    }

    /**
     * Zobrazí modál a čaká na prihlásenie.
     */
    async handleLogin() {
        if (!this.loginOverlay || !this.loginForm || !this.emailInput || !this.passwordInput || !this.loginErrorMsg) {
            console.error("[MW] Kritická chyba: Chýbajú HTML elementy pre prihlásenie.");
            return Promise.reject(new Error("Chýbajú prihlasovacie elementy."));
        }

        // Načítanie zapamätaného e-mailu
        const savedEmail = localStorage.getItem('okr_remembered_email');
        if (savedEmail) {
            this.emailInput.value = savedEmail;
            const rememberMeCheckbox = document.getElementById(IDs.AUTH.REMEMBER_CHECKBOX);
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        }

        this.loginOverlay.classList.remove('hidden');

        return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
                if (authUser) {
                    unsubscribe();
                    try {
                        const userProfile = await this._processLogin(authUser);
                        resolve(userProfile);
                    } catch (error) {
                        console.error("[MW] Chyba pri overovaní oprávnení:", error);
                        let msg = error.message;
                        this.loginErrorMsg.textContent = msg;
                        this.loginErrorMsg.style.display = 'block';
                        await signOut(auth);
                        resolve(null);
                    }
                } else if (auth.currentUser === null) {
                    this.loginErrorMsg.style.display = 'none';
                }
            });

            this._setupLoginFormListeners(unsubscribe, resolve);
        });
    }

    async _processLogin(authUser) {
        let employeeData = null;
        let employeeId = null;

        if (isDemoUser(authUser.email)) {
            console.log("[Login] Demo užívateľ. Načítavam profil 'test'.");
            const docRef = doc(store.getDB(), "employees", "test");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                employeeData = docSnap.data();
                employeeId = "test";
                activateDemoMode();
            } else {
                throw new Error("Demo profil (ID: test) neexistuje v databáze.");
            }
        } else {
            const employeesRef = collection(store.getDB(), "employees");
            const q = query(employeesRef, where("mail", "==", authUser.email), limit(1));
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                throw new Error(`Nenašiel sa profil pre ${authUser.email} v 'employees'.`);
            }
            employeeData = snapshot.docs[0].data();
            employeeId = snapshot.docs[0].id;
        }

        let userRole = 'user';
        try {
            const roleRef = doc(store.getDB(), "user_roles", authUser.uid);
            const roleDoc = await getDoc(roleRef);
            if (roleDoc.exists()) {
                userRole = roleDoc.data().role;
            }
        } catch (roleError) {
            console.error("[Login] Chyba pri sťahovaní role:", roleError);
        }

        const currentUserProfile = {
            uid: authUser.uid,
            id: employeeId,
            email: authUser.email,
            ...employeeData,
            role: userRole,
            displayName: `${employeeData.titul || ''} ${employeeData.meno} ${employeeData.priezvisko}`.trim()
        };

        store.setUser(currentUserProfile);
        updateLogsUser(currentUserProfile);
        await logUserAction("LOGIN", "Úspešné prihlásenie", true, null);

        const portalContainer = document.querySelector('.portal-container');
        if (portalContainer) {
            requestAnimationFrame(() => {
                portalContainer.classList.add('app-visible');
            });
        }

        this.loginOverlay.classList.add('fade-out');
        setTimeout(() => {
            this.loginOverlay.classList.add('hidden');
            this.loginOverlay.classList.remove('fade-out');
        }, 500);

        return currentUserProfile;
    }

    _setupLoginFormListeners(unsubscribe, resolve) {
        this.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            this.loginErrorMsg.style.display = 'none';
            const email = this.emailInput.value.trim();
            const password = this.passwordInput.value.trim();
            const shouldRemember = document.querySelector(`#${IDs.AUTH.REMEMBER_CHECKBOX}`)?.checked || false;
            const submitBtn = this.loginForm.querySelector('.btn-modern-login');
            const originalBtnContent = submitBtn.innerHTML;

            if (!email || !password) {
                this.loginErrorMsg.textContent = 'Zadajte e-mail aj heslo.';
                this.loginErrorMsg.style.display = 'block';
                return;
            }

            try {
                submitBtn.classList.add('loading');
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fas fa-spinner"></i> <span>Prihlasujem...</span>`;

                const persistence = shouldRemember ? browserLocalPersistence : browserSessionPersistence;
                await setPersistence(auth, persistence);
                await signInWithEmailAndPassword(auth, email, password);

                if (shouldRemember) {
                    localStorage.setItem('okr_remembered_email', email);
                } else {
                    localStorage.removeItem('okr_remembered_email');
                }

            } catch (error) {
                console.error("[MW] Chyba pri prihlásení v Auth:", error);
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;

                let msg = 'Prístup zamietnutý.';
                if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                    msg = 'Nesprávny e-mail alebo heslo.';
                } else if (error.message) {
                    msg = error.message;
                }
                this.loginErrorMsg.textContent = msg;
                this.loginErrorMsg.style.display = 'block';
                this.passwordInput.value = '';
            }
        });
    }

    /**
     * Nastaví event listener pre logout.
     */
    setupLogout() {
        if (!this.logoutBtn) return;
        this.logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                if (store.getUser()) {
                    await logUserAction("LOGOUT", "Používateľ sa manuálne odhlásil", true);
                }
                await signOut(auth);
                store.resetState();
                showToast("Boli ste úspešne odhlásený.", TOAST_TYPE.INFO);
                window.location.reload();
            } catch (error) {
                console.error("Chyba pri odhlasovaní:", error);
                showToast("Vyskytla sa chyba pri odhlasovaní.", TOAST_TYPE.ERROR);
            }
        });
    }

    /**
     * Nastaví event listener pre reload.
     */
    setupReload() {
        if (!this.reloadBtn) return;
        this.reloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const { clearEmployeesIDB, clearAIIndexIDB } = await import('./db_service.js');
            await Promise.all([clearEmployeesIDB(), clearAIIndexIDB()]);
            console.log('Cache vymazaná, reštartujem...');
            window.location.reload();
        });
    }

    /**
     * Nastaví logiku pre zmenu hesla.
     */
    setupPasswordChange() {
        if (!this.changePassBtn || !this.changePassModal) return;

        this.changePassBtn.onclick = (e) => {
            e.preventDefault();
            this.changePassModal.classList.remove('hidden');
            if (this.changePassForm) this.changePassForm.reset();
            if (this.passErrorMsg) {
                this.passErrorMsg.style.display = 'none';
                this.passErrorMsg.textContent = '';
            }
        };

        if (this.closePassModalBtn) {
            this.closePassModalBtn.onclick = () => this.changePassModal.classList.add('hidden');
        }

        if (this.changePassForm) {
            this.changePassForm.onsubmit = async (e) => {
                e.preventDefault();
                if (this.passErrorMsg) this.passErrorMsg.style.display = 'none';

                const currentPass = document.getElementById(IDs.AUTH_MODALS.CURRENT_PASSWORD).value;
                const newPass = document.getElementById(IDs.AUTH_MODALS.NEW_PASSWORD).value;
                const confirmPass = document.getElementById(IDs.AUTH_MODALS.CONFIRM_PASSWORD).value;

                if (newPass !== confirmPass) return this._showPassError("Nové heslá sa nezhodujú.");
                if (newPass.length < 6) return this._showPassError("Nové heslo musí mať aspoň 6 znakov.");

                try {
                    const user = auth.currentUser;
                    if (!user) throw new Error("Používateľ nie je prihlásený.");

                    const submitBtn = this.changePassForm.querySelector('button[type="submit"]');
                    submitBtn.textContent = "Overujem...";
                    submitBtn.disabled = true;

                    const credential = EmailAuthProvider.credential(user.email, currentPass);
                    await reauthenticateWithCredential(user, credential);

                    submitBtn.textContent = "Ukladám...";
                    await updatePassword(user, newPass);

                    await logUserAction("ZMENA_HESLA", "Používateľ si úspešne zmenil heslo.", true);
                    showToast("Heslo bolo úspešne zmenené.", TOAST_TYPE.SUCCESS);
                    this.changePassModal.classList.add('hidden');
                    this.changePassForm.reset();

                } catch (error) {
                    console.error("Chyba pri zmene hesla:", error);
                    let msg = "Nepodarilo sa zmeniť heslo.";
                    if (error.code === 'auth/wrong-password') msg = "Nesprávne súčasné heslo.";
                    await logUserAction("ZMENA_HESLA", "Zlyhal pokus o zmenu hesla", false, msg);
                    this._showPassError(msg);
                } finally {
                    const submitBtn = this.changePassForm.querySelector('button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.textContent = "Zmeniť heslo";
                        submitBtn.disabled = false;
                    }
                }
            };
        }
    }

    _showPassError(msg) {
        if (this.passErrorMsg) {
            this.passErrorMsg.textContent = msg;
            this.passErrorMsg.style.display = 'block';
            this.passErrorMsg.classList.add('shake');
            setTimeout(() => this.passErrorMsg.classList.remove('shake'), 500);
        } else {
            alert(msg);
        }
    }

    /**
     * Nastaví logiku pre zabudnuté heslo.
     */
    setupForgotPassword() {
        if (!this.forgotLink || !this.forgotModal || !this.forgotForm) return;

        this.forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.forgotModal.classList.remove('hidden');
            if (this.forgotErrorMsg) this.forgotErrorMsg.style.display = 'none';

            if (this.emailInputLogin && this.emailInputLogin.value) {
                this.forgotEmailInput.value = this.emailInputLogin.value;
            } else {
                this.forgotEmailInput.value = '';
            }
            this.forgotEmailInput.focus();
        });

        if (this.closeForgotModalBtn) {
            this.closeForgotModalBtn.addEventListener('click', () => this.forgotModal.classList.add('hidden'));
        }

        this.forgotModal.addEventListener('click', (e) => {
            if (e.target === this.forgotModal) this.forgotModal.classList.add('hidden');
        });

        this.forgotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const userEmail = this.forgotEmailInput.value.trim();
            if (!userEmail) return;

            const submitBtn = this.forgotForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Otváram e-mail...';

            const subject = `Žiadosť o reset hesla - OKR Portál`;
            const body = `Dobrý deň,\n\nprosím o resetovanie hesla pre používateľa s e-mailom: ${userEmail}.\n\nĎakujem.`;
            const mailtoLink = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

            window.location.href = mailtoLink;
            showToast("Otvoril sa váš e-mailový klient. Odošlite správu adminovi.", TOAST_TYPE.INFO);
            this.forgotModal.classList.add('hidden');
            this.forgotForm.reset();

            submitBtn.disabled = false;
            submitBtn.textContent = 'Odoslať';
        });
    }

    /**
     * Aktualizuje sidebar s údajmi používateľa.
     */
    updateSidebarUser(user) {
        const userNameEl = document.getElementById(IDs.NAV.USER_NAME);
        const userPositionEl = document.getElementById(IDs.NAV.USER_POSITION);

        if (userNameEl && userPositionEl) {
            if (user) {
                userNameEl.textContent = user.displayName || '---';
                userPositionEl.textContent = user.funkcia || '---';
            } else {
                userNameEl.textContent = '---';
                userPositionEl.textContent = '---';
            }
        }
    }
}