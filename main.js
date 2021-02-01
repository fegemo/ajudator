
hljs.initHighlightingOnLoad()

setTimeout(() => {
    hljs.initLineNumbersOnLoad()
    
    const app = new annotator.App()
    app.include(annotator.ui.main, {
        element: document.querySelector('main pre')
    })
    app.include(annotator.storage.http, {
        prefix: '/api'
    })
    app.include(() => ({
        annotationsLoaded: annotations => {
            annotations.forEach(ann => {
                const markedEl = document.querySelector(`[data-annotation-id="${ann.id}"]`)
                if (markedEl) {
                    const tdEl = markedEl.parentElement
                    const divEl = document.createElement('div')
                    divEl.className = 'comment'
                    divEl.innerHTML = ann.text
                    tdEl.appendChild(divEl)
                }
            })
        }
    }))
    app.start()
        .then(function () {
            app.annotations.load();
        });
}, 0)


