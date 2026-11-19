import { firstLink, splitLinks } from '../../lib/links';

describe('splitLinks', () => {
  it('splits text and links, leaving sentence punctuation out of the link', () => {
    expect(splitLinks('see https://example.com/a, then go.')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://example.com/a', url: 'https://example.com/a' },
      { kind: 'text', text: ', then go.' },
    ]);
  });

  it('upgrades bare www. hosts to https', () => {
    expect(firstLink('www.example.org/x')).toBe('https://www.example.org/x');
  });

  it('keeps a balanced closing paren inside the URL', () => {
    const segs = splitLinks('(https://en.wikipedia.org/wiki/Foo_(bar))');
    const link = segs.find((s) => s.kind === 'link');
    expect(link?.text).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });

  it('does not treat numbers or emails as links', () => {
    expect(splitLinks('call 555-0100 or a@b.com')).toEqual([{ kind: 'text', text: 'call 555-0100 or a@b.com' }]);
    expect(firstLink(null)).toBeNull();
  });
});
