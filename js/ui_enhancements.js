/* js/ui_enhancements.js - Advanced UI Components */
/**
 * =============================================
 * UI ENHANCEMENTS MODULE
 * Loading States, Animations, Micro-interactions
 * =============================================
 */

import { showToast, TOAST_TYPE } from './utils.js';

/**
 * =============================================
 * LOADING MANAGER
 * =============================================
 */

export class LoadingManager {
    static activeLoaders = new Set();

    /**
     * Zobrazí loading state
     * @param {string} elementId - ID elementu
     * @param {Object} options - Konfigurácia
     */
    static show(elementId, options = {}) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const {
            type = 'spinner',      // 'spinner' | 'skeleton' | 'progress' | 'dots'
            message = 'Načítavam...',
            overlay = false,       // Tmavý overlay
            size = 'medium'        // 'small' | 'medium' | 'large'
        } = options;

        element.dataset.originalContent = element.innerHTML;
        element.classList.add('loading-state');

        let loaderHTML = '';

        switch (type) {
            case 'spinner':
                loaderHTML = this.createSpinner(message, size);
                break;
            case 'skeleton':
                loaderHTML = this.createSkeleton();
                break;
            case 'progress':
                loaderHTML = this.createProgressBar(message);
                break;
            case 'dots':
                loaderHTML = this.createDots(message);
                break;
            default:
                loaderHTML = this.createSpinner(message, size);
        }

        if (overlay) {
            element.style.position = 'relative';
            loaderHTML = `<div class="loader-overlay">${loaderHTML}</div>`;
        }

        element.innerHTML = loaderHTML;
        this.activeLoaders.add(elementId);
    }

    /**
     * Skryje loading state
     */
    static hide(elementId, content = null) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.classList.remove('loading-state');

        if (content !== null) {
            element.innerHTML = content;
        } else if (element.dataset.originalContent) {
            element.innerHTML = element.dataset.originalContent;
            delete element.dataset.originalContent;
        }

        this.activeLoaders.delete(elementId);
    }

    /**
     * Update progress bar
     */
    static updateProgress(elementId, percent, message = null) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const bar = element.querySelector('.progress-bar-fill');
        const text = element.querySelector('.progress-text');

        if (bar) {
            bar.style.width = `${percent}%`;
        }

        if (text && message) {
            text.textContent = message;
        }
    }

    // === LOADER TEMPLATES ===

    static createSpinner(message, size) {
        const sizeClass = `spinner-${size}`;
        return `
            <div class="loading-spinner ${sizeClass}">
                <div class="spinner-circle"></div>
                ${message ? `<p class="spinner-message">${message}</p>` : ''}
            </div>
        `;
    }

    static createSkeleton() {
        return `
            <div class="skeleton-loader">
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
            </div>
        `;
    }

    static createProgressBar(message) {
        return `
            <div class="progress-loader">
                ${message ? `<p class="progress-text">${message}</p>` : ''}
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: 0%"></div>
                </div>
            </div>
        `;
    }

    static createDots(message) {
        return `
            <div class="dots-loader">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
                ${message ? `<p class="dots-message">${message}</p>` : ''}
            </div>
        `;
    }

    /**
     * Injectuje CSS pre loadery
     */
    static injectStyles() {
        if (document.getElementById('loading-manager-styles')) return;

        const style = document.createElement('style');
        style.id = 'loading-manager-styles';
        style.textContent = `
            .loading-state {
                pointer-events: none;
                opacity: 0.7;
            }

            .loader-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100;
                border-radius: inherit;
            }

            /* Spinner */
            .loading-spinner {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 15px;
            }

            .spinner-circle {
                border: 3px solid var(--color-border);
                border-top-color: var(--color-orange-accent);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }

            .spinner-small .spinner-circle {
                width: 20px;
                height: 20px;
            }

            .spinner-medium .spinner-circle {
                width: 40px;
                height: 40px;
            }

            .spinner-large .spinner-circle {
                width: 60px;
                height: 60px;
            }

            .spinner-message {
                color: var(--color-text-secondary);
                font-size: 0.9rem;
                margin: 0;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* Skeleton */
            .skeleton-loader {
                padding: 20px;
            }

            .skeleton-line {
                height: 16px;
                background: linear-gradient(
                    90deg,
                    var(--color-bg-light) 25%,
                    var(--color-bg-hover) 50%,
                    var(--color-bg-light) 75%
                );
                background-size: 200% 100%;
                border-radius: 4px;
                margin-bottom: 12px;
                animation: skeleton-pulse 1.5s ease-in-out infinite;
            }

            .skeleton-line.short {
                width: 60%;
            }

            @keyframes skeleton-pulse {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }

            /* Progress Bar */
            .progress-loader {
                padding: 20px;
            }

            .progress-text {
                margin: 0 0 10px 0;
                color: var(--color-text-secondary);
                font-size: 0.9rem;
                text-align: center;
            }

            .progress-bar {
                width: 100%;
                height: 8px;
                background: var(--color-bg-light);
                border-radius: 4px;
                overflow: hidden;
            }

            .progress-bar-fill {
                height: 100%;
                background: linear-gradient(
                    90deg,
                    var(--color-orange-accent),
                    var(--color-orange-hover)
                );
                transition: width 0.3s ease;
                border-radius: 4px;
            }

            /* Dots */
            .dots-loader {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 15px;
            }

            .dots-loader > div:first-child {
                display: flex;
                gap: 8px;
            }

            .dot {
                width: 12px;
                height: 12px;
                background: var(--color-orange-accent);
                border-radius: 50%;
                animation: dots-bounce 1.4s ease-in-out infinite;
            }

            .dot:nth-child(1) { animation-delay: 0s; }
            .dot:nth-child(2) { animation-delay: 0.2s; }
            .dot:nth-child(3) { animation-delay: 0.4s; }

            @keyframes dots-bounce {
                0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
                40% { transform: scale(1.2); opacity: 1; }
            }

            .dots-message {
                color: var(--color-text-secondary);
                font-size: 0.9rem;
                margin: 0;
            }
        `;

        document.head.appendChild(style);
    }
}

/**
 * =============================================
 * RIPPLE EFFECT
 * =============================================
 */

export class RippleEffect {
    static init() {
        // Automaticky pridať ripple na všetky tlačidlá
        document.querySelectorAll('button, .btn, .icon-btn').forEach(btn => {
            this.addRipple(btn);
        });

        console.log('[RippleEffect] Initialized');
    }

    static addRipple(element) {
        if (element.dataset.ripple === 'added') return;

        element.style.position = 'relative';
        element.style.overflow = 'hidden';

        element.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.className = 'ripple';

            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';

            this.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });

        element.dataset.ripple = 'added';
    }

    static injectStyles() {
        if (document.getElementById('ripple-styles')) return;

        const style = document.createElement('style');
        style.id = 'ripple-styles';
        style.textContent = `
            .ripple {
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(0);
                animation: ripple-animation 0.6s ease-out;
                pointer-events: none;
            }

            @keyframes ripple-animation {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
        `;

        document.head.appendChild(style);
    }
}

/**
 * =============================================
 * TOAST ENHANCEMENTS
 * =============================================
 */

export class EnhancedToast {
    /**
     * Toast s progress barom
     */
    static showWithProgress(message, type, duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast-message ${type} with-progress`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="toast-icon ${this.getIcon(type)}"></i>
                <span>${message}</span>
            </div>
            <div class="toast-progress">
                <div class="toast-progress-bar"></div>
            </div>
        `;

        document.body.appendChild(toast);

        // Animácia progress baru
        setTimeout(() => {
            const bar = toast.querySelector('.toast-progress-bar');
            bar.style.transition = `width ${duration}ms linear`;
            bar.style.width = '0%';
        }, 10);

        // Slide in
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    static getIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        return icons[type] || icons.info;
    }

    static injectStyles() {
        if (document.getElementById('enhanced-toast-styles')) return;

        const style = document.createElement('style');
        style.id = 'enhanced-toast-styles';
        style.textContent = `
            .toast-message.with-progress {
                padding: 0;
                overflow: hidden;
            }

            .toast-content {
                padding: 15px 20px;
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .toast-icon {
                font-size: 1.2rem;
            }

            .toast-progress {
                height: 4px;
                background: rgba(0, 0, 0, 0.2);
            }

            .toast-progress-bar {
                height: 100%;
                width: 100%;
                background: rgba(255, 255, 255, 0.3);
            }

            .toast-message {
                animation: toast-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .toast-message.removing {
                animation: toast-slide-out 0.2s ease-out forwards;
            }

            @keyframes toast-slide-in {
                from {
                    transform: translateY(-100%) scale(0.8);
                    opacity: 0;
                }
                to {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                }
            }

            @keyframes toast-slide-out {
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;

        document.head.appendChild(style);
    }
}

/**
 * =============================================
 * PAGE TRANSITIONS
 * =============================================
 */

export class PageTransitions {
    static init() {
        this.setupModuleTransitions();
        console.log('[PageTransitions] Initialized');
    }

    static setupModuleTransitions() {
        const modulesContainer = document.querySelector('.modules-scroll-container');
        if (!modulesContainer) return;

        // Observe module changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList.contains('module-content')) {
                        this.animateModuleEntry(node);
                    }
                });
            });
        });

        observer.observe(modulesContainer, {
            childList: true,
            subtree: true
        });
    }

    static animateModuleEntry(element) {
        element.style.animation = 'fade-slide-in 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    }

    static injectStyles() {
        if (document.getElementById('page-transition-styles')) return;

        const style = document.createElement('style');
        style.id = 'page-transition-styles';
        style.textContent = `
            @keyframes fade-slide-in {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .module-content {
                animation: fade-slide-in 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            }
        `;

        document.head.appendChild(style);
    }
}

/**
 * =============================================
 * FORM ENHANCEMENTS
 * =============================================
 */

export class FormEnhancements {
    static enhanceForm(formId) {
        const form = document.getElementById(formId);
        if (!form) return;

        const inputs = form.querySelectorAll('input, select, textarea');

        inputs.forEach(input => {
            // Real-time validácia
            input.addEventListener('blur', () => {
                this.validateField(input);
            });

            // Clear error on focus
            input.addEventListener('focus', () => {
                this.clearFieldError(input);
            });

            // Character counter pre textareas
            if (input.tagName === 'TEXTAREA' && input.hasAttribute('maxlength')) {
                this.addCharCounter(input);
            }
        });

        // Submit validácia
        form.addEventListener('submit', (e) => {
            let isValid = true;

            inputs.forEach(input => {
                if (!this.validateField(input)) {
                    isValid = false;
                }
            });

            if (!isValid) {
                e.preventDefault();
                showToast('Opravte chyby vo formulári', TOAST_TYPE.ERROR);

                // Focus na prvé chybné pole
                const firstError = form.querySelector('.error');
                if (firstError) {
                    firstError.focus();
                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });
    }

    static validateField(input) {
        const value = input.value.trim();
        const type = input.type;
        const required = input.hasAttribute('required');

        let error = null;

        // Required check
        if (required && !value) {
            error = 'Toto pole je povinné';
        }
        // Email validation
        else if (type === 'email' && value && !this.isValidEmail(value)) {
            error = 'Neplatný email formát';
        }
        // Min length
        else if (input.hasAttribute('minlength') && value.length > 0 && value.length < input.minLength) {
            error = `Minimálne ${input.minLength} znakov`;
        }
        // Max length
        else if (input.hasAttribute('maxlength') && value.length > input.maxLength) {
            error = `Maximálne ${input.maxLength} znakov`;
        }
        // Pattern
        else if (input.hasAttribute('pattern') && value && !new RegExp(input.pattern).test(value)) {
            error = input.getAttribute('title') || 'Neplatný formát';
        }

        if (error) {
            this.showFieldError(input, error);
            return false;
        }

        return true;
    }

    static showFieldError(input, message) {
        input.classList.add('error');
        input.setAttribute('aria-invalid', 'true');

        let errorEl = input.parentElement.querySelector('.field-error');
        if (!errorEl) {
            errorEl = document.createElement('span');
            errorEl.className = 'field-error';
            errorEl.setAttribute('role', 'alert');
            input.parentElement.appendChild(errorEl);
        }

        errorEl.textContent = message;
    }

    static clearFieldError(input) {
        input.classList.remove('error');
        input.removeAttribute('aria-invalid');

        const errorEl = input.parentElement.querySelector('.field-error');
        if (errorEl) errorEl.remove();
    }

    static isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    static addCharCounter(textarea) {
        const maxLength = textarea.maxLength;
        const counter = document.createElement('div');
        counter.className = 'char-counter';
        counter.textContent = `0 / ${maxLength}`;

        textarea.parentElement.appendChild(counter);

        textarea.addEventListener('input', () => {
            const length = textarea.value.length;
            counter.textContent = `${length} / ${maxLength}`;

            if (length > maxLength * 0.9) {
                counter.style.color = 'var(--color-orange-accent)';
            } else {
                counter.style.color = 'var(--color-text-secondary)';
            }
        });
    }

    static injectStyles() {
        if (document.getElementById('form-enhancement-styles')) return;

        const style = document.createElement('style');
        style.id = 'form-enhancement-styles';
        style.textContent = `
            .field-error {
                display: block;
                color: #ef4444;
                font-size: 0.85rem;
                margin-top: 4px;
                animation: shake 0.3s ease-in-out;
            }

            input.error,
            select.error,
            textarea.error {
                border-color: #ef4444 !important;
            }

            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }

            .char-counter {
                text-align: right;
                font-size: 0.85rem;
                color: var(--color-text-secondary);
                margin-top: 4px;
            }
        `;

        document.head.appendChild(style);
    }
}

/**
 * =============================================
 * INITIALIZATION
 * =============================================
 */

export function initUIEnhancements() {
    LoadingManager.injectStyles();
    RippleEffect.injectStyles();
    RippleEffect.init();
    EnhancedToast.injectStyles();
    PageTransitions.injectStyles();
    PageTransitions.init();
    FormEnhancements.injectStyles();

    console.log('[UIEnhancements] All UI enhancements initialized');
}

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUIEnhancements);
} else {
    initUIEnhancements();
}
