const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, './frontend_full/src');
const outputFilePath = path.join(__dirname, 'components.json');

let components = [];

function convertFilesToJSON(dir, baseDir) {
    fs.readdir(dir, (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            return;
        }

        let pending = files.length;
        if (!pending) return writeJSON();

        files.forEach(file => {
            const filePath = path.join(dir, file);
            fs.stat(filePath, (err, stat) => {
                if (err) {
                    console.error('Error stating file:', err);
                    return;
                }

                if (stat.isDirectory()) {
                    convertFilesToJSON(filePath, baseDir);
                } else if (['.js', '.jsx', '.ts', '.tsx'].includes(path.extname(file))) {
                    fs.readFile(filePath, 'utf8', (err, data) => {
                        if (err) {
                            console.error('Error reading file:', err);
                            return;
                        }

                        const relativePath = path.relative(baseDir, filePath);
                        components.push({ name: relativePath, code: data });

                        if (!--pending) writeJSON();
                    });
                } else {
                    if (!--pending) writeJSON();
                }
            });
        });
    });
}

function writeJSON() {
    fs.writeFile(outputFilePath, JSON.stringify({ components }, null, 2), 'utf8', err => {
        if (err) {
            console.error('Error writing JSON file:', err);
        } else {
            console.log(`All components have been converted to ${outputFilePath}`);
        }
    });
}

convertFilesToJSON(srcDir, srcDir);
