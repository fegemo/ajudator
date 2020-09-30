#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import decompress from 'decompress';
import handler from 'serve-handler';
import http from 'http';
import unrarPromise from 'unrar-promise';
import readline from 'readline';
import chalk from 'chalk';
import logUpdate from 'log-update';
import terminalLink from 'terminal-link';
import { Transform } from 'stream'
import { promisify } from 'util'

const log = logUpdate.create(process.stdout, { showCursor: false });
const PORT = 3001
const SERVER_URL = `http://localhost:${PORT}`
const SAVED_DATA_PATH = 'notas'

let currentSubmissionIndex = 0;
let students = [];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});


rl.on('line', async line => {
    readline.moveCursor(process.stdout, 0, -1)

    const grade = parseInt(line);
    if (grade >= 0 && grade <= 100) {
        students[currentSubmissionIndex].grade = grade;
        currentSubmissionIndex++
        const persisted = persistData()
        renderState();

        if (currentSubmissionIndex >= students.length) {
            await persisted
            log.done()
            rl.close()
            console.log(`Fim! Os arquivos ${chalk.green(SAVED_DATA_PATH + '.json')} e ${chalk.green(SAVED_DATA_PATH + '.csv')} foram salvos.`)
            process.exit(0);
        }
    }

})


const MOODLE_FOLDER_REGEX = /([^_]+)_[\d]+_assignsubmission_file_/
const ARCHIVE_EXTENSIONS = ['.zip', '.tar.gz', '.bzip', '.rar']

class Student {
    constructor(directory) {
        const data = MOODLE_FOLDER_REGEX.exec(directory);
        this.name = data[1];
        this.directory = directory;
        this.graded = new Promise((res, rej) => this.resolveGrading = res);
        this.grade = null;
    }

    get state() {
        if (this.grade) {
            return chalk.green(' ✓ ')
        } else {
            return ' - '
        }
    }

    get grade() {
        return this.score;
    }

    set grade(score) {
        this.score = score;
        if (score != null) {
            this.resolveGrading()
        }
    }
}

function renderState() {
    const content = students.map((s, i) => `${s.state} ${s.name}` + (i < currentSubmissionIndex ? '. ' + chalk.blue(`Nota: ${s.grade}%`) : (i == currentSubmissionIndex ? `. ${chalk.gray('Digite a nota e aperte ') + '[Enter]'}` : '')))
    log(content.join('\n'));
}

fs.readdir('.', async (err, files) => {
    const submissionFolders = files.filter(f => MOODLE_FOLDER_REGEX.test(f));
    students = submissionFolders.map(f => new Student(f)).sort();
    console.log(`Bem vindo ao ${chalk.yellow('ajudator')}!`);
    console.log(`  1. Abra o servidor em ${terminalLink(SERVER_URL, SERVER_URL)}.`);
    console.log(`  2. Digite uma nota de ${chalk.yellow('0 a 100')} para cada trabalho.`);
    console.log('')
    await setupServer()
    
    console.log(`Encontradas ${students.length} submissões:`);
    renderState();

    const runNextSubmission = () => {
        findExtractAndShowSubmission(students[currentSubmissionIndex])
            .then(() => {
                if (currentSubmissionIndex < students.length) {
                    runNextSubmission(currentSubmissionIndex)
                }
            })
    }
    runNextSubmission()

});


async function deflate(input, output) {
    if (input.endsWith('.rar')) {
        return unrarPromise.unrar(input, output);
    } else {
        return decompress(input, output);
    }
}

function findExtractAndShowSubmission(student) {
    return new Promise(async (resolve, reject) => {
        // busca em largura na pasta, pesquisando por um arquivo compactado
        // praticamente sempre (espera-se que sempre) exista apenas 1 arquivo compactado (nenhuma subpasta)
        const queue = [student.directory];
        do {
            const p = queue.shift();
            const contents = fs.readdirSync(p, { withFileTypes: true });
            const archives = contents.filter(c => c.isFile()).filter(c => ARCHIVE_EXTENSIONS.some(ext => c.name.endsWith(ext)));
            
            // se há ao menos 1 archive, descompacta e termina
            if (archives.length > 0) {
                deflate(path.join(p, archives[0].name), p)
                    .then(() => {
                        const rootFolder = findFolderWithHTML(student, p)
                        student.rootFolder = rootFolder;
                    })
                    .catch(error => console.log(error))
                    .then(() => student.graded)
                    .then(() => resolve())
                break;
            } else {
                // senão, coloca os diretórios na fila
                queue.push(...contents.filter(c => c.isDirectory()).map(c => path.join(p, c.name)));
            }
    
        } while (queue.length > 0);
    });

}

function findFolderWithHTML(student, p) {
    // vai navegando em profundidade até achar uma pasta que contenha um arquivo HTML.
    // é esperado que haja um na própria pasta
    const contents = fs.readdirSync(p, { withFileTypes: true })
    const htmlFiles = contents.filter(c => c.isFile() && c.name.endsWith('.html'));
    if (htmlFiles.length > 0) {
        return p;
    }

    const subfolders = contents.filter(c => c.isDirectory()).map(c => path.join(p, c.name));
    for (const f of subfolders) {
        if (findFolderWithHTML(student, f)) {
            return f;
        }
    }

    // não há HTML nesta pasta nem em nenhuma subpasta
    return null;
}

function setupServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((request, response) => {
            const currentStudentFolder = students[currentSubmissionIndex].rootFolder;
            const injection = getHTMLInjection(students[currentSubmissionIndex])
                if (currentStudentFolder) {
                return handler(request, response, { public: currentStudentFolder }, {
                    lstat: async absolutePath => {
                        const stats = await promisify(fs.lstat)(absolutePath)
                        if (absolutePath.endsWith('.html')) {
                            stats.size += injection.length;
                        }
                        return stats;
                    },
                    createReadStream: (absolutePath, streamOpts) => {
                        const stream = fs.createReadStream(absolutePath, streamOpts)
                        const appendTransform = new Transform({
                            transform(chunk, encoding, callback) {
                                callback(null, chunk);
                            },
                            flush(callback) {
                                if (absolutePath.endsWith('.html')) {
                                    this.push(injection, 'utf8');
                                }
                                callback();
                            }
                        });
                        
                        return stream.pipe(appendTransform);
                    }
                });
            } else {
                return 'Nenhum aluno selecionado.'
            }
        })

        server.listen(PORT, resolve);
    })
}

function persistData() {
    const dirName = path.basename(path.resolve())
    const data = {
        tarefa: dirName,
        submissoes: students.map(s => ({ nome: s.name, nota: s.grade/100 }))
    }
    return Promise.all([
        new Promise((res, rej) => {
            fs.writeFile(SAVED_DATA_PATH + '.json', JSON.stringify(data, null, '\t'), (err) => {
                if (err) {
                    rej(err)
                } else {
                    res();
                }
            })
        }),
        new Promise((res, rej) => {
            fs.writeFile(SAVED_DATA_PATH + '.csv', 'Nome,Nota\n' + students.map(s=>`${s.name},${s.grade/100}`).join('\n'), (err) => {
                if (err) {
                    rej(err)
                } else {
                    res();
                }
            })
        })
    ])
}


function getHTMLInjection(student) {
    return `
        <div style="display:block; max-width:400px; position:fixed; right:5px; bottom:5px; border-radius:10px; z-index:1000; background:#ffffffaa; border:1px solid gray; padding:1.25em; text-align:center;">
            <span style="color:black; font-size:24px;">${student.name}</span>
        </div>
    `
}