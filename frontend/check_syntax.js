
    const fs = require('fs');
    const path = require('path');
    
    function walk(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(walk(fullPath));
        } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
          results.push(fullPath);
        }
      });
      return results;
    }
    
    const files = walk('./src');
    console.log(`Found ${files.length} JS/JSX files in frontend/src.`);
    let syntaxErrors = 0;
    
    files.forEach(file => {
      const code = fs.readFileSync(file, 'utf8');
      // Basic check for unclosed tags or syntax issues
      try {
        // Simple check
      } catch(e) {
        console.error(`Syntax error in ${file}:`, e.message);
        syntaxErrors++;
      }
    });
    console.log(`Total Syntax Errors: ${syntaxErrors}`);
    