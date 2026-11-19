import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MessageBubble, type BubbleProps } from '../../components/conversation/MessageBubble';
import type { TimelineMessage } from '../../lib/types';

jest.mock('../../lib/api', () => ({ api: { signedAttachmentUrl: jest.fn(() => new Promise(() => {})) } }));

const m: TimelineMessage = {
  id: 'm1',
  couple_id: 'c',
  channel_id: 'ch',
  sender_id: 'me',
  kind: 'text',
  body: 'See https://example.com today',
  attachment: null,
  reply_to_id: null,
  reactions: { heart: ['me', 'p'] },
  urgent: false,
  created_at: '2026-11-18T10:00:00Z',
  updated_at: '2026-11-18T10:00:00Z',
  edited_at: '2026-11-18T10:01:00Z',
  deleted_at: null,
  done_at: null,
  done_by: null,
  moved_from_channel_id: null,
  moved_at: null,
};

function props(over: Partial<BubbleProps> = {}): BubbleProps {
  return {
    message: m,
    mine: true,
    me: 'me',
    partnerName: 'Natasha',
    completable: false,
    replyTarget: undefined,
    movedFromName: null,
    seen: false,
    showMeta: true,
    onActions: jest.fn(),
    onToggleDone: jest.fn(),
    onReact: jest.fn(),
    onRetry: jest.fn(),
    onDiscard: jest.fn(),
    ...over,
  };
}

describe('MessageBubble', () => {
  it('renders links, edited, Seen, and who reacted in words (no counts)', () => {
    const screen = render(<MessageBubble {...props({ seen: true })} />);
    expect(screen.getByRole('link')).toBeTruthy();
    expect(screen.getByText(/edited · Seen/)).toBeTruthy();
    expect(screen.getByText('Both')).toBeTruthy();
  });

  it('a refused send shows ✕ Not sent with Retry and Discard', () => {
    const p = props({ message: { ...m, local: { status: 'failed', error: 'no' } } });
    const screen = render(<MessageBubble {...p} />);
    expect(screen.getByText('✕ Not sent')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(p.onRetry).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Discard'));
    expect(p.onDiscard).toHaveBeenCalled();
  });

  it('a completable channel gives each message a circle that ticks to ✓ Done', () => {
    const p = props({ completable: true, mine: false });
    const screen = render(<MessageBubble {...p} />);
    fireEvent.press(screen.getByRole('checkbox', { name: 'Open. Mark as done' }));
    expect(p.onToggleDone).toHaveBeenCalled();
    const done = render(<MessageBubble {...props({ completable: true, message: { ...m, done_at: '2026-11-18T11:00:00Z' } })} />);
    expect(done.getByText(/✓ Done/)).toBeTruthy();
  });

  it('marks "needs you now", a move, and a deleted message', () => {
    const screen = render(<MessageBubble {...props({ message: { ...m, urgent: true }, movedFromName: 'Everyday' })} />);
    expect(screen.getByText('Needs you now')).toBeTruthy();
    expect(screen.getByText(/Moved from Everyday/)).toBeTruthy();
    const gone = render(<MessageBubble {...props({ message: { ...m, deleted_at: '2026-11-18T11:00:00Z', body: null } })} />);
    expect(gone.getByText('Message deleted')).toBeTruthy();
  });

  it('long press opens the actions sheet', () => {
    const p = props();
    const screen = render(<MessageBubble {...p} />);
    fireEvent(screen.getByTestId('message-m1'), 'longPress');
    expect(p.onActions).toHaveBeenCalledWith(m);
  });
});
