const database = require('../models/database');

async function setupDatabase() {
  try {
    console.log('Setting up LSLT Portal database...');
    
    // Connect to database
    await database.connect();
    
    // Create all tables
    await database.createTables();
    
    // Insert default data
    await database.insertDefaultData();
    
    console.log('Database setup completed successfully!');
    console.log('Default admin credentials:');
    console.log('  Email: admin@lslt.local');
    console.log('  PIN: 280493');
    
    process.exit(0);
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;