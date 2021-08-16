const editorType = document.body.dataset.editorType ?? 'code'

switch (editorType) {
    case 'code':
        const { initCodeEditor } = await import('./editor-code.js')
        initCodeEditor()
        break;

    case 'image':
        const { initImageEditor } = await import('./editor-image.js')
        initImageEditor()
        break;
}


document.querySelectorAll('.message.shown .close').forEach(el => el.onclick = () => el.closest('.message').classList.remove('shown'))

import './stamps.js'
