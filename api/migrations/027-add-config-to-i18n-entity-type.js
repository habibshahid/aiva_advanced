'use strict';

/**
 * Migration: Add 'config' to entity_type ENUM in i18n_content table
 * 
 * The i18n_content table was created with entity_type ENUM('flow', 'step', 'intent', 'template')
 * but we also need to store translations for IVR config fields (greeting, no_match, etc.)
 */

module.exports = {
    async up(queryInterface, Sequelize) {
        const db = queryInterface.sequelize;
        
        console.log('Adding "config" to entity_type ENUM in yovo_tbl_aiva_ivr_i18n_content...');
        
        try {
            // Alter the ENUM to include 'config'
            await db.query(`
                ALTER TABLE yovo_tbl_aiva_ivr_i18n_content 
                MODIFY COLUMN entity_type ENUM('flow', 'step', 'intent', 'template', 'config') NOT NULL
            `);
            
            console.log('✓ Added "config" to entity_type ENUM');
            
        } catch (error) {
            // Check if it's because 'config' already exists
            if (error.message.includes('Duplicate')) {
                console.log('⚠ "config" already exists in ENUM, skipping');
            } else {
                throw error;
            }
        }
    },
    
    async down(queryInterface, Sequelize) {
        const db = queryInterface.sequelize;
        
        console.log('Removing "config" from entity_type ENUM...');
        
        // First delete any config entries
        await db.query(`
            DELETE FROM yovo_tbl_aiva_ivr_i18n_content 
            WHERE entity_type = 'config'
        `);
        
        // Then modify ENUM back
        await db.query(`
            ALTER TABLE yovo_tbl_aiva_ivr_i18n_content 
            MODIFY COLUMN entity_type ENUM('flow', 'step', 'intent', 'template') NOT NULL
        `);
        
        console.log('✓ Removed "config" from entity_type ENUM');
    }
};