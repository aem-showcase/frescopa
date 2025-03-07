import { subscribe } from '../../rules/index.js';
import { decorateIcons } from '../../../../scripts/aem.js';

export class Modal {
  constructor() {
    this.dialog = null;
    this.formModel = null;
    this.panel = null;
    this.modalWrapper = null;
    this.originalContent = null; // Store original content
  }

  createDialog(panel) {
    const dialog = document.createElement('dialog');
    const dialogContent = document.createElement('div');
    dialogContent.classList.add('modal-content');
    // Use the stored original content instead of panel.childNodes
    if (this.originalContent) {
      // Clone the nodes to avoid reference issues
      this.originalContent.forEach((node) => {
        dialogContent.appendChild(node.cloneNode(true));
      });
    } else {
      // First time initialization - store original content
      this.originalContent = [...panel.childNodes];
      this.originalContent.forEach((node) => {
        dialogContent.appendChild(node.cloneNode(true));
      });
    }

    dialog.append(dialogContent);
    const closeButton = document.createElement('button');
    closeButton.classList.add('close-button');
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.type = 'button';
    closeButton.innerHTML = '<span class="icon icon-close"></span>';
    dialog.append(closeButton);
    decorateIcons(closeButton);
    dialog.addEventListener('click', (event) => {
      const dialogDimensions = dialog.getBoundingClientRect();
      if (event.clientX < dialogDimensions.left || event.clientX > dialogDimensions.right
          || event.clientY < dialogDimensions.top || event.clientY > dialogDimensions.bottom) {
        dialog.close();
      }
    });
    dialog.querySelector('.close-button').addEventListener('click', () => {
      dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      dialog.remove();
      if (this.formModel) {
        this.formModel.getElement(panel?.id).visible = false;
      }
    });
    return dialog;
  }

  showModal() {
    // If dialog was previously removed, recreate it
    if (!this.dialog || !this.dialog.isConnected) {
      this.dialog = this.createDialog(this.panel);
      if (this.modalWrapper) {
        this.modalWrapper.appendChild(this.dialog);
      }
    }

    if (this.dialog.isConnected) {
      this.dialog.showModal();
      document.body.classList.add('modal-open');
      setTimeout(() => {
        this.dialog.querySelector('.modal-content').scrollTop = 0;
      }, 0);
    }
  }

  setFormModel(model) {
    this.formModel = model;
  }

  wrapDialog(panel) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('modal');
    wrapper.appendChild(this.dialog);
    // Clear panel before adding wrapper
    panel.innerHTML = '';
    panel.appendChild(wrapper);
    this.modalWrapper = wrapper;
  }

  decorate(panel) {
    this.panel = panel;
    this.dialog = this.createDialog(panel);
    this.wrapDialog(panel);
  }
}

export default async function decorate(panel) {
  const modal = new Modal();
  modal.decorate(panel);
  subscribe(panel, async (fieldDiv, formModel) => {
    modal.setFormModel(formModel);
    if (formModel.getElement(fieldDiv.id).visible === true) {
      modal.showModal();
    }
  });
  return panel;
}
