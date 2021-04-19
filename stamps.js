import interact from 'https://cdn.interactjs.io/v1.10.3/interactjs/index.js'

const putStampSoundPath = 'audio/put-stamp.wav'
const removeStampSoundPath = 'audio/remove-stamp.wav'
const stampContainerEl = document.querySelector('#stamp-container')
const stampButtonContainerEl = document.querySelector('#stamp-button-container')

interact('.stamp-button')
    .draggable({
        listeners: {
            start(e) {
                console.log('started')
                console.log(e)
                // duplica este stamp-button e o coloca na posição do original
                const clonedEl = e.currentTarget.cloneNode()
                e.currentTarget.parentNode.appendChild(clonedEl)
                clonedEl.classList.add('another-being-dragged')

                // altera stamp-button para stamp e move para div container de stamps
                e.currentTarget.style.position = 'absolute'
                e.currentTarget.style.zIndex = 10
            },
            move: dragMoveListener,
            end(e) {
                const stampBeingDraggedEl = e.currentTarget
                const stampButtonEl = document.querySelector('#stamp-buttons .another-being-dragged')
                
                if (stampBeingDraggedEl.classList.contains('dropped')) {
                    stampButtonEl.classList.remove('another-being-dragged')
                } else {
                    // se não soltou numa dropzone, faz animação de voltar
                    // e destrói
                    stampBeingDraggedEl.style.transition = 'transform ease-out 800ms'
                    stampBeingDraggedEl.style.transform = `translate(0px, 0px)`
                    stampBeingDraggedEl.addEventListener('transitionend', selfDestroy)
                    
                    function selfDestroy() {
                        stampButtonEl.classList.remove('another-being-dragged')
                        stampBeingDraggedEl.removeEventListener('transitionend', selfDestroy)
                        stampBeingDraggedEl.remove()
                    }
                }
            }
        },
        inertia: true,
        autoScroll: true
    })

interact('main pre').dropzone({
    accept: '.stamp-button',
    overlap: 0.75,

    ondropactivate(event) {
        // add active dropzone feedback
        event.target.classList.add('drop-active')
    },

    ondragenter(event) {
        var draggableElement = event.relatedTarget
        var dropzoneElement = event.target

        // feedback the possibility of a drop
        dropzoneElement.classList.add('drop-target')
        draggableElement.classList.add('can-drop')
        // draggableElement.textContent = 'Dragged in'
    },

    ondragleave(event) {
        // remove the drop feedback style
        event.target.classList.remove('drop-target')
        event.relatedTarget.classList.remove('can-drop')
        // event.relatedTarget.textContent = 'Dragged out'
    },
    
    ondrop(event) {
        const stampButtonBeingDroppedEl = event.relatedTarget
        stampButtonBeingDroppedEl.classList.add('dropped')
        stampButtonBeingDroppedEl.classList.add('stamp')
        stampButtonBeingDroppedEl.classList.remove('stamp-button')
        stampButtonBeingDroppedEl.classList.remove('can-drop')

        const codeContainerRect = document.querySelector('main pre').getBoundingClientRect()
        let {x, y, width, height} = stampButtonBeingDroppedEl.getBoundingClientRect()
        const intendedWidth = stampButtonBeingDroppedEl.dataset.width || width
        const intendedHeight = stampButtonBeingDroppedEl.dataset.height || height
        
        const stampsContainerEl = document.querySelector('#stamps-container')
        stampsContainerEl.appendChild(stampButtonBeingDroppedEl)

        x -= codeContainerRect.x + intendedWidth  / 4
        y -= codeContainerRect.y - intendedHeight / 8

        stampButtonBeingDroppedEl.style.transition = 'all cubic-bezier(0.1, 1.81, 1, 1.25) 300ms'
        stampButtonBeingDroppedEl.ontransitionend = () => stampButtonBeingDroppedEl.style.transition = null
        stampButtonBeingDroppedEl.style.width = intendedWidth + 'px'
        stampButtonBeingDroppedEl.style.height = intendedHeight + 'px'
        stampButtonBeingDroppedEl.style.transform = `translate(${x}px, ${y}px) scale(0.01)`
        setTimeout(() => {
            stampButtonBeingDroppedEl.style.transform = `translate(${x}px, ${y}px) scale(1)`
            stampButtonBeingDroppedEl.dataset.x = x;
            stampButtonBeingDroppedEl.dataset.y = y;
            new Audio(putStampSoundPath).play()
        }, 0)
    },

    ondropdeactivate(event) {
        // remove active dropzone feedback
        event.target.classList.remove('drop-active')
        event.target.classList.remove('drop-target')
    }
})


interact('.stamp')
    .resizable({
        // resize from all edges and corners
        edges: { left: false, right: true, bottom: true, top: false },

        listeners: {
            move(event) {
                const target = event.target
                let x = (parseFloat(target.getAttribute('data-x')) || 0)
                let y = (parseFloat(target.getAttribute('data-y')) || 0)

                const oldTransitionDuration = target.style.transitionDuration
                target.style.transitionDuration = 0
                setTimeout(() => {
                    target.style.width = event.rect.width + 'px'
                    target.style.height = event.rect.height + 'px'
    
                    target.style.transitionDuration = oldTransitionDuration
                }, 0)
            }
        },
        modifiers: [
            interact.modifiers.aspectRatio({
                ratio: 'preserve'
            })
        ]
    })
    .draggable({
        listeners: { move: dragMoveListener },
        inertia: true,
        autoScroll: true
    })
    .on('doubletap', event => {
        const stampToDeleteEl = event.currentTarget
        stampToDeleteEl.style.transition = 'transform cubic-bezier(1,-0.86, 1, 1) 400ms'
        stampToDeleteEl.ontransitionend = () => stampToDeleteEl.remove()
        stampToDeleteEl.style.transform += ' scale(0.001)'
        new Audio(removeStampSoundPath).play()
    })


function dragMoveListener(event) {
    var target = event.target
    // keep the dragged position in the data-x/data-y attributes
    var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
    var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy

    // translate the element
    target.style.transform = 'translate(' + x + 'px, ' + y + 'px)'

    // update the posiion attributes
    target.setAttribute('data-x', x)
    target.setAttribute('data-y', y)
}
