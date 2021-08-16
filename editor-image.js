import { MarkerArea } from './marker2/markerjs2.esm.js'

export const initImageEditor = async () => {
  const targetEl = document.querySelector('main > figure > img')
  const fileName = document.body.dataset.editorFileName

  async function showMarkerArea(el) {
    targetEl.setAttribute('crossorigin', 'anonymous')

    const markerArea = new MarkerArea(targetEl)
    markerArea.addRenderEventListener(async (imgURL, state) => {
      targetEl.src = imgURL
      
      // envia requisição para salvar estado
      await fetch(`/api/screenshot?arquivo=${fileName}`, {
        method: 'PUT',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(state)
      })
    })

    markerArea.availableMarkerTypes = markerArea.ALL_MARKER_TYPES
    markerArea.show()

    if (!showMarkerArea.calledOnce) {
      // envia requisição para ver se já tem um estado salvo
      const response = await fetch(`/api/screenshot?arquivo=${fileName}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
      })
      const state = await response.json()
      if (state && state.markers) {
        markerArea.restoreState(state);
      }
    }

    showMarkerArea.calledOnce = true
  }
  
  targetEl.addEventListener('click', showMarkerArea.bind(this))
  showMarkerArea(targetEl)

}

