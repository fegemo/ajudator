export const initCodeEditor = async () => {
  hljs.highlightAll()

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
        setTimeout(() => {
          annotations.forEach(burnAnnotation)
        }, 200)
      },
      annotationCreated: burnAnnotation,
      annotationUpdated: burnAnnotation,
      beforeAnnotationDeleted: removeAnnotation
    }))
    app.start()
      .then(function () {
        app.annotations.load();
      });
  }, 0)
}


function burnAnnotation(ann) {
  const markedEl = document.querySelector(`[data-annotation-id="${ann.id}"]`)
  if (markedEl) {
    const tdEl = markedEl.parentElement
    let divEl = tdEl.querySelector('div.comment')
    if (!divEl) {
      // criando
      divEl = document.createElement('div')
      divEl.className = 'comment'
      divEl.innerHTML = ann.text
      divEl.dataset.fatherId = ann.id
      tdEl.appendChild(divEl)
    } else {
      // atualizando
      divEl.innerHTML = ann.text
    }
  }
}

function removeAnnotation(ann) {
  const commentEl = document.querySelector(`div.comment[data-father-id="${ann.id}"]`)
  if (commentEl) {
    commentEl.remove()
  }
}