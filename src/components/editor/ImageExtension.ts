import { mergeAttributes, Node } from '@tiptap/core';

export const VaultImageNode = Node.create({
  name: 'vaultImage',
  group: 'block',
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => el.getAttribute('src') || '',
      },
      alt: {
        default: '',
        parseHTML: (el) => el.getAttribute('alt') || '',
      },
      assetRef: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-asset-ref') || null,
      },
      opacity: {
        default: 1,
        parseHTML: (el) => {
          const val = el.getAttribute('data-opacity');
          return val ? parseFloat(val) : 1;
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const opacity = typeof HTMLAttributes.opacity === 'number' ? HTMLAttributes.opacity : 1;
    const extra: Record<string, string> = {
      class: 'vault-embedded-img',
      'data-opacity': String(opacity),
      style: `opacity: ${opacity};`,
    };
    if (HTMLAttributes.assetRef) {
      extra['data-asset-ref'] = String(HTMLAttributes.assetRef);
    }
    const { assetRef: _ignored, ...rest } = HTMLAttributes;
    return ['img', mergeAttributes(rest, extra)];
  },
});
