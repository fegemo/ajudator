#!/usr/bin/env node

import fs, { readFile } from 'fs';
import path from 'path';
import decompress from 'decompress';
import seven from '7zip-min';
import handler from 'serve-handler';
import http from 'http';
import unrar from 'unrar';
import readline from 'readline';
import chalk from 'chalk';
import logUpdate from 'log-update';
import terminalLink from 'terminal-link';
import { Transform } from 'stream'
import { promisify } from 'util'
import express from 'express'
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readdir, readFile as readFilePromise, writeFile as writeFilePromise } from 'fs/promises';
import crypto from 'crypto';
import url from 'url'
import cheerio from 'cheerio'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const log = logUpdate.create(process.stdout, { showCursor: false });
const PORT = 3001
const CODE_PORT = PORT + 1
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

    if (line === 'q' || line === 'Q') {
        // salva as notas dadas e sai
        const persisted = persistData()
        await persisted
        log.done()
        rl.close()
        console.log(`Fim! Os arquivos ${chalk.green(SAVED_DATA_PATH + '.json')} e ${chalk.green(SAVED_DATA_PATH + '.csv')} foram salvos.`)
        process.exit(0);
    }

    const grade = parseInt(line);
    if (grade >= 0 && grade <= 250) {
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
const MOODLE_COMMENT_REGEX = /([^_]+)_[\d]+_assignsubmission_onlinetext_/
const MOODLE_COMMENT_TEMPLATE_REGEX = /<!DOCTYPE html><html>/
const ARCHIVE_EXTENSIONS = ['.zip', '.7z', '.tar.gz', '.tar', '.bzip', '.rar']

class Student {
    constructor(name, directory, comment, grade) {
        this.name = name;
        this.directory = directory;
        this.comment = comment;
        this.graded = new Promise((res, rej) => this.resolveGrading = res);

        if (!directory) {
            this.grade = (grade * 100) || 0;
            this.graded = Promise.resolve();
        } else if (grade !== undefined) {
            this.grade = grade * 100;
            this.graded = Promise.resolve();
        }
    }

    get state() {
        if (this.alreadyGraded) {
            return chalk.green(' ✓ ')
        } else {
            return ' - '
        }
    }

    get alreadyGraded() {
        return this.grade != null;
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

    static clearName(name) {
        return name.replace(/'/g, '')
    }
}

function renderState() {
    const content = students.map((s, i) => `${s.state} ${s.name}` + (i < currentSubmissionIndex ? '. ' + chalk.blue(`Nota: ${s.grade.toFixed(0)}%`) : (i == currentSubmissionIndex ? `. ${chalk.gray('Digite a nota e aperte ') + '[Enter]'}` : '')))
    log(content.join('\n'));
}

fs.readFile('./alunos.json', 'utf-8', (err, data) => {
    const allStudents = JSON.parse(data);
    fs.readFile('./notas.json', 'utf-8', (err, data) => {
        const previousGrades = JSON.parse((data || '{ "submissoes": [] }')).submissoes;
        fs.readdir('.', async (err, files) => {        
            const submissionFolders = files.filter(f => MOODLE_FOLDER_REGEX.test(f));
            const commentFolders = files.filter(f => MOODLE_COMMENT_REGEX.test(f));
            students = allStudents.map(name => {
                const directory = submissionFolders.find(f => MOODLE_FOLDER_REGEX.exec(f)[1] === Student.clearName(name));
                const grade = (previousGrades.find(a => a.nome === name) || {}).nota
                let commentDirectory = commentFolders.find(f => MOODLE_COMMENT_REGEX.exec(f)[1] === Student.clearName(name))
                let comment = null

                if (commentDirectory) {
                    comment = fs.readFileSync(path.join(commentDirectory, 'textoonline.html'), 'utf-8')
                    if (MOODLE_COMMENT_TEMPLATE_REGEX.test(comment)) {
                        const $ = cheerio.load(comment)
                        comment = $('body > p').html()
                    } else {
                        comment = null
                    }
                }

                return new Student(name, directory, comment, grade);
            });
    
            console.log(`Bem vindo ao ${chalk.yellow('ajudator')}!`);
            if (students.length === 0) {
                console.log('- Não foram encontradas pastas de submissão de trabalhos aqui. Saindo...')
                process.exit(0)
            }
        
            console.log(`  1. Abra o servidor em ${terminalLink(SERVER_URL, SERVER_URL)}.`);
            console.log(`  2. Digite uma nota de ${chalk.yellow('0 a 200')} (%) para cada trabalho.`);
            console.log('')
            await setupServer()
        
            console.log(`Encontradas ${submissionFolders.length} submissões de ${students.length} alunos${previousGrades.length ? (' com ' + previousGrades.length + ' notas já salvas') : ''}:`);
        
            const runNextSubmission = () => {
                renderState();
                while (currentSubmissionIndex < students.length && students[currentSubmissionIndex].alreadyGraded) {
                    currentSubmissionIndex++;
                    renderState();
                }
                
                if (currentSubmissionIndex >= students.length) {
                    return;
                }

                findExtractAndShowSubmission(students[currentSubmissionIndex])
                    .then(() => {
                        if (currentSubmissionIndex < students.length) {
                            runNextSubmission(currentSubmissionIndex)
                        }
                    })
                    .catch(() => {
                        if (currentSubmissionIndex < students.length) {
                            runNextSubmission(currentSubmissionIndex)
                        }
                    })
            }
            runNextSubmission()
        
        });
    })

});


async function deflate(input, output) {
    if (input.endsWith('.rar')) {
        const archive = new unrar({
            path: input,
            arguments: ['-x', '-o+']
        });
        
        return new Promise((res, rej) => {
            archive.list((err, entries) => {
                if (err) {
                    rej(err);
                    return;
                }

                const directories = entries
                    .filter(e => e.type !== 'File')
                    .map(e => 
                        fs.promises.mkdir(path.join(output, e.name), { recursive: true })
                            .catch(rej)
                    )
                Promise.all(directories).then(() => {
                    const files = entries.filter(e => e.type === 'File').map(entry =>
                        new Promise((resolve, reject) => {
                            const stream = archive.stream(entry.name)
                            stream.on('error', reject)
                            stream.on('end', resolve)
                            stream.pipe(fs.createWriteStream(path.join(output, entry.name)));
                        })
                    )
                    Promise.all(files).then(() => res(), (e) => rej(e))
               })
               .catch(rej)
            });
        })
    } else if (input.endsWith('.7z')) {
        return new Promise((res, rej) => {
            seven.unpack(input, output, err => {
                if (err) rej(err);
                res();
            });
        })
    } else {
        return decompress(input, output);
    }
}

function findExtractAndShowSubmission(student) {
    return new Promise(async (resolve, reject) => {
        if (student.alreadyGraded) {
            resolve();
        }
        // busca em largura na pasta, pesquisando por um arquivo compactado
        // praticamente sempre (espera-se que sempre) exista apenas 1 arquivo compactado (nenhuma subpasta)
        const queue = [student.directory];
        do {
            const p = queue.shift();
            const contents = fs.readdirSync(p, { withFileTypes: true });
            const archives = contents.filter(c => c.isFile()).filter(c => ARCHIVE_EXTENSIONS.some(ext => c.name.endsWith(ext)));
            
            // se há ao menos 1 archive, descompacta e termina
            if (archives.length > 0) {
                const archivePath = path.join(p, archives[0].name)
                deflate(archivePath, p)
                    .then(() => {
                        const rootFolder = findFolderWithHTML(student, p)
                        student.rootFolder = rootFolder;
                    })
                    .catch(error => {
                        const rootFolder = findFolderWithHTML(student, p)
                        if (!rootFolder) {
                            console.log(`Erro ao descompactar '${archivePath}' de ${student.name}:`)
                            console.log(error)
                            reject()
                            
                        } else {
                            student.rootFolder = rootFolder;
                        }
                    })
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
        let found = findFolderWithHTML(student, f)
        if (found) {
            return found;
        }
    }

    // não há HTML nesta pasta nem em nenhuma subpasta
    return null;
}

async function getFiles(dir) {
    const dirents = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    }));
    return files.flat();
}

function sluggify(path) {
    return path.replace(/[\/\-\.]/g, '-')
}

async function loadAnnotations(directory, file = '') {
    return readFilePromise(path.join(directory, `${sluggify(file)}-annotations.json`), { encoding: 'utf-8' })
        .then(content => JSON.parse(content))
        .catch(error => Promise.resolve([]))
}

async function saveAnnotations(directory, file = '', content) {
    content = JSON.stringify(content, null, 2)
    return writeFilePromise(path.join(directory, `${sluggify(file)}-annotations.json`), content, { encoding: 'utf-8' })
}

function getActivityName() {
    const currentWD = process.cwd()
    const lastSeparatorIndex = currentWD.lastIndexOf(path.sep)
    if (lastSeparatorIndex !== -1) {
        return currentWD.substr(lastSeparatorIndex + 1)
    } else {
        return currentWD
    }
}

function setupServer() {
    const serverPromises = [];
    serverPromises.push(new Promise((resolve, reject) => {
        const server = http.createServer((request, response) => {
            const currentStudentFolder = students[currentSubmissionIndex].rootFolder;
            const injection = getHTMLInjection(students[currentSubmissionIndex])
            if (currentStudentFolder) {
                return handler(request, response, { 
                        public: currentStudentFolder,
                        headers: [
                            {
                                source: '**/*',
                                headers: [
                                    {
                                        key: 'Cache-Control',
                                        value: 'no-cache'
                                    }
                                ]
                            }
                        ]
                    }, {
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
                    }
                );
            } else {
                return 'Nenhum aluno selecionado.'
            }
        })

        server.listen(PORT, resolve)
    }))

    
    const activityName = getActivityName()

    serverPromises.push(new Promise((resolve, reject) => {
        const app = express()
        app.set('views', __dirname)
        app.set('view engine', 'ejs')
        
        app.use((req, res, next) => {
            if (req.headers['content-type'] && req.headers['content-type'].startsWith('application/json')) {
                req.headers['content-type'] = 'application/json'
            }
            next()
        })
        app.use(express.urlencoded({ extended: true }));
        app.use(express.json());
        app.get('/', (req, res) => {
            const currentStudent = students[currentSubmissionIndex];
            let listFiles = currentStudent.rootFolder ? getFiles(currentStudent.rootFolder) : Promise.resolve([])
            listFiles.then(files => files.map(f => {
                const fileName = f.substr(f.indexOf(currentStudent.rootFolder) + currentStudent.rootFolder.length + 1)
                const file = {
                    name: fileName,
                }
                if (['html', 'css', 'js'].reduce((prev, curr) => prev || fileName.endsWith(curr), false)) {
                    file.url = `?arquivo=${fileName}`
                } 
                return file
            }))
                .then(directoryFiles => {
                    let currentFilePath = req.query.arquivo
                    let currentFileContents = null
                    if (currentFilePath) {
                        try {
                            currentFileContents = fs.readFileSync(
                                path.join(currentStudent.rootFolder, currentFilePath),
                                { encoding: 'utf-8'}
                            )
                        } catch (error) {
                            console.log(`Erro lendo arquivo ${currentFilePath}: `, error)
                        }
                    }
                    
        
                    res.render('index', {
                        title: currentFilePath ? currentFilePath.substr(Math.max(0, currentFilePath.lastIndexOf('/'))) : 'Atividade',
                        activityName,
                        studentName: currentStudent.name,
                        files: directoryFiles,
                        file: {
                            name: currentFilePath ? currentFilePath : 'Nenhum arquivo selecionado',
                            sourceCode: currentFileContents ? currentFileContents : 'Nada para mostrar'
                        }
                    })
                })
        })

        app.get('/api', (req, res) => res.json({
            message: 'Annotator Store API',
            annotation: {
                create: {
                    desc: 'Create a new annotation',
                    method: 'POST',
                    url: '/api/annotations'
                },
                delete: {
                    desc: 'Delete an annotation',
                    method: 'DELETE',
                    url: '/api/annotations/:id'
                },
                read: {
                    desc: 'Get an existing annotatino',
                    method: 'GET',
                    url: '/api/annotations/:id'
                },
                update: {
                    desc: 'Update an existing annotation',
                    method: 'PUT',
                    url: '/api/annotations/:id'
                },
            },
            search: {
                desc: 'Basic search API',
                method: 'GET',
                url: '/api/search'
            }
        }))
        app.get('/api/annotations/:id', async (req, res) => {
            const currentStudent = students[currentSubmissionIndex];
            const file = url.parse(req.headers['referer'], true).query.arquivo
            const db = await loadAnnotations(currentStudent.directory, file)
            const id = req.params.id
            const annotationIndex = db.findIndex(an => an.id === id)
            if (annotationIndex !== -1) {
                res.json(db[annotationIndex])
            } else {
                res.sendStatus(404)
            }
        })
        app.post('/api/annotations', async (req, res) => {
            const currentStudent = students[currentSubmissionIndex];
            const file = url.parse(req.headers['referer'], true).query.arquivo
            const db = await loadAnnotations(currentStudent.directory, file)
            const annotation = req.body
            const id = crypto.randomBytes(16).toString('hex');
            db.push({
                id,
                ...annotation
            })
            await saveAnnotations(currentStudent.directory, file, db)
            res.json(db[db.length - 1])
        })
        app.put('/api/annotations/:id', async (req, res) => {
            const currentStudent = students[currentSubmissionIndex];
            const file = url.parse(req.headers['referer'], true).query.arquivo
            const db = await loadAnnotations(currentStudent.directory, file)
            const newAnnotation = req.body
            const id = req.params.id
            const annotationIndex = db.findIndex(an => an.id === id)
            if (annotationIndex !== -1) {
                for (let field in newAnnotation) {
                    db[annotationIndex][field] = newAnnotation[field] 
                }
                await saveAnnotations(currentStudent.directory, file, db)
                res.json(db[annotationIndex])
            } else {
                res.sendStatus(404)
            }
        })
        app.delete('/api/annotations/:id', async (req, res) => {
            const currentStudent = students[currentSubmissionIndex];
            const file = url.parse(req.headers['referer'], true).query.arquivo
            const db = await loadAnnotations(currentStudent.directory, file)
            const id = req.params.id
            const annotationIndex = db.findIndex(an => an.id === id)
            
            if (annotationIndex !== -1 ) {
                db.splice(annotationIndex, 1)
                await saveAnnotations(currentStudent.directory, file, db)
                res.sendStatus(204)
            } else {
                res.sendStatus(404)
            }
        })
        app.get('/api/search', async (req, res) => {
            const currentStudent = students[currentSubmissionIndex];
            const file = url.parse(req.headers['referer'], true).query.arquivo
            const db = await loadAnnotations(currentStudent.directory, file)
            const text = req.query.text
            const limit = req.query.limit
            const offset = req.query.offset

            let results = db
            if (text) {
                results = db.filter(ann => ann.text.indexOf(text) !== -1)
            }
            if (offset) {
                results = results.slice(offset)
            }
            if (limit) {
                results = results.slice(0, limit)
            }
            res.json({
                total: results.length,
                rows: results
            })
        })

        app.use(express.static(__dirname));
        app.listen(CODE_PORT, () => resolve())
    }))
}

function persistData() {
    const dirName = path.basename(path.resolve())
    const data = {
        tarefa: dirName,
        submissoes: students.filter(s => s.alreadyGraded).map(s => ({ nome: s.name, nota: s.grade/100 }))
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
    const commentPart = student.comment ? `<p style="font-size: 12px; margin-bottom: 0;">${student.comment}</p>` : ``
    return `
        <div style="display:block; max-width:540px; position:fixed; right:5px; bottom:5px; border-radius:10px; z-index:1000; background:#ffffffaa; border:1px solid gray; padding:0.75em 1.25em; text-align:center;">
            <span style="color:black; font-size:24px;">${student.name}</span>
            ${commentPart}
            <a href="http://localhost:${CODE_PORT}" target="code" style="display: block; color: #fff; background: #c57900; width: fit-content; margin: .5em auto 0em; padding: 0.5em 1em; font-size: 1.1em; box-shadow: 2px 2px 2px #0004; border: 1px solid gray; text-decoration: none;">Ver o código</a>
        </div>
    `

    "background: antiquewhite;"
}