import { mergeAttributes, Node } from '@tiptap/core';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, string>;
  suggestion: Omit<SuggestionOptions, 'editor'>;
}

export const WikiLinkNode = Node.create<WikiLinkOptions>({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      suggestion: {
        char: '[[',
        allowSpaces: true,
        command: ({ editor, range, props }) => {
          const item = props as { title: string };
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: this.name,
                attrs: { target: item.title, label: item.title },
              },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
      },
    };
  },

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-wikilink') || el.textContent?.replace(/^\[\[|\]\]$/g, '') || '',
        renderHTML: (attrs) => ({ 'data-wikilink': attrs.target }),
      },
      label: {
        default: '',
        parseHTML: (el) =>
          el.getAttribute('data-wikilink-alias') ||
          el.textContent?.replace(/^\[\[|\]\]$/g, '') ||
          el.getAttribute('data-wikilink') ||
          '',
        renderHTML: (attrs) =>
          attrs.label && attrs.label !== attrs.target
            ? { 'data-wikilink-alias': attrs.label }
            : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-wikilink]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = node.attrs.label || node.attrs.target;
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'wikilink-pill',
        role: 'link',
      }),
      label,
    ];
  },

  renderText({ node }) {
    const alias = node.attrs.label && node.attrs.label !== node.attrs.target ? `|${node.attrs.label}` : '';
    return `[[${node.attrs.target}${alias}]]`;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
