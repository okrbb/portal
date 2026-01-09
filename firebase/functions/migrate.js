/**
 * Firebase Cloud Function na migráciu primátor → primator
 * 
 * Inštalácia:
 * 1. Otvor Firebase Console: https://console.firebase.google.com
 * 2. Zvoľ projekt: okrbb-portal-prod
 * 3. Choď do: Build > Functions
 * 4. Klikni "Create function"
 * 5. Skopíruj kód nižšie do editora
 * 6. Deploy
 * 7. Spusti funkciu z Firebase Console
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.migratePrimatorField = functions.https.onRequest(async (req, res) => {
    try {
        console.log("🔄 Spúšťam migráciu: primátor → primator");
        
        const contactsRef = db.collection("contacts");
        const regions = await contactsRef.get();
        
        if (regions.empty) {
            return res.status(400).json({ error: "Zbierka contacts je prázdna" });
        }
        
        let processedRegions = 0;
        let changedMunicipalities = 0;
        
        for (const regionDoc of regions.docs) {
            const regionId = regionDoc.id;
            console.log(`\n📍 Spracovávam región: ${regionId}`);
            
            const municipalitiesRef = regionDoc.ref.collection("municipalities");
            const municipalities = await municipalitiesRef.get();
            
            console.log(`  → Nájdených mestností: ${municipalities.size}`);
            
            for (const munDoc of municipalities.docs) {
                const munData = munDoc.data();
                
                if (munData["primátor"]) {
                    const value = munData["primátor"];
                    
                    await munDoc.ref.update({
                        "primátor": admin.firestore.FieldValue.delete(),
                        "primator": value
                    });
                    
                    changedMunicipalities++;
                    console.log(`  ✓ ${munData.id || munDoc.id}: ${value} → preimenované`);
                }
            }
            
            processedRegions++;
        }
        
        const result = {
            success: true,
            message: "Migrácia dokončená!",
            processedRegions,
            changedMunicipalities
        };
        
        console.log(`\n✅ MIGRÁCIA DOKONČENÁ!`);
        console.log(`📊 Spracovaných regiónov: ${processedRegions}`);
        console.log(`🔄 Zmenených mestností: ${changedMunicipalities}`);
        
        return res.status(200).json(result);
        
    } catch (error) {
        console.error("❌ Chyba pri migrácii:", error);
        return res.status(500).json({ 
            error: error.message,
            details: error
        });
    }
});
