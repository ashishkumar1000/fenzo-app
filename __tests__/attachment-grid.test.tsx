/**
 * AttachmentGrid's layout branches (AC 4): photos land in a 3-column grid,
 * the signature sits in its own full-width row, and a null presigned URL
 * renders the "Tap refresh" placeholder instead of a broken image.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Image } from 'react-native';

import { AttachmentGrid } from '../src/features/jobDetail/components/AttachmentGrid';
import type { JobAttachment } from '../src/services';

function attachment(
  id: string,
  type: JobAttachment['type'],
  url: string | null,
): JobAttachment {
  return { id, type, url, createdAt: '2026-09-03T09:00:00Z' };
}

/** All rendered text strings, document order. */
function renderedText(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestRendererJSON): void => {
    if (node.type === 'Text') {
      const direct = (node.children ?? []).filter(
        (c): c is string => typeof c === 'string',
      );
      if (direct.length) out.push(direct.join(''));
    }
    (node.children ?? []).forEach(child => {
      if (typeof child !== 'string') walk(child);
    });
  };
  const json = renderer.toJSON();
  const roots = Array.isArray(json) ? json : json ? [json] : [];
  roots.forEach(root => (typeof root === 'string' ? undefined : walk(root)));
  return out;
}

/**
 * Count host Views carrying a given testID in the rendered JSON — the
 * instance tree double-counts (View wrapper + native View share props), the
 * host JSON is what RN actually mounts.
 */
function countByTestID(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): number {
  let count = 0;
  const walk = (node: ReactTestRenderer.ReactTestRendererJSON): void => {
    if (node.props && (node.props as { testID?: string }).testID === testID) count += 1;
    (node.children ?? []).forEach(child => {
      if (typeof child !== 'string') walk(child);
    });
  };
  const json = renderer.toJSON();
  const roots = Array.isArray(json) ? json : json ? [json] : [];
  roots.forEach(root => (typeof root === 'string' ? undefined : walk(root)));
  return count;
}

function renderGrid(attachments: JobAttachment[]) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      React.createElement(AttachmentGrid, { attachments }),
    );
  });
  return renderer;
}

describe('AttachmentGrid', () => {
  it('renders a null-url photo as the placeholder with a retry hint, and a url photo as an image', () => {
    const renderer = renderGrid([
      attachment('p1', 'photo', 'https://r2.example/p1.jpg'),
      attachment('p2', 'photo', null),
    ]);

    const images = renderer.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toEqual({ uri: 'https://r2.example/p1.jpg' });

    expect(renderedText(renderer)).toContain('Tap refresh');
  });

  it('renders up to three photos per row (3-column grid)', () => {
    const renderer = renderGrid([
      attachment('p1', 'photo', null),
      attachment('p2', 'photo', null),
      attachment('p3', 'photo', null),
      attachment('p4', 'photo', null),
    ]);

    // Two rows, split 3 + 1 — checked via the row structure the grid emits
    // (tiles live inside the row Views).
    const images = renderer.root.findAllByType(Image);
    expect(images).toHaveLength(0); // all placeholders
    expect(renderedText(renderer).filter(t => t === 'Tap refresh')).toHaveLength(4);
    // The trailing short row is padded with invisible fillers so the 4th
    // photo's tile stays exactly one-third wide (never stretched full-width).
    expect(countByTestID(renderer, 'attachment-filler')).toBe(2);
  });

  it('renders the signature in its own row below the photos', () => {
    const renderer = renderGrid([
      attachment('p1', 'photo', 'https://r2.example/p1.jpg'),
      attachment('s1', 'signature', 'https://r2.example/sig.png'),
    ]);

    expect(renderedText(renderer)).toContain('Customer signature');
    const images = renderer.root.findAllByType(Image);
    expect(images).toHaveLength(2);
    expect(images[1].props.source).toEqual({ uri: 'https://r2.example/sig.png' });
  });

  it('renders a null-url signature as the placeholder too', () => {
    const renderer = renderGrid([attachment('s1', 'signature', null)]);

    expect(renderedText(renderer)).toContain('Customer signature');
    expect(renderedText(renderer)).toContain('Tap refresh');
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  });

  it('renders nothing but the photos when there is no signature', () => {
    const renderer = renderGrid([attachment('p1', 'photo', 'https://r2.example/p1.jpg')]);

    expect(renderedText(renderer)).not.toContain('Customer signature');
    expect(renderer.root.findAllByType(Image)).toHaveLength(1);
  });

  it('swaps a failed image load for the placeholder (e.g. an expired presigned URL)', () => {
    const renderer = renderGrid([attachment('p1', 'photo', 'https://r2.example/p1.jpg')]);
    expect(renderer.root.findAllByType(Image)).toHaveLength(1);

    ReactTestRenderer.act(() => {
      renderer.root.findAllByType(Image)[0].props.onError(new Error('403'));
    });

    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    expect(renderedText(renderer)).toContain('Tap refresh');
  });
});