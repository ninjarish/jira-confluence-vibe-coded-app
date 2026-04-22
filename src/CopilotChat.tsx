import { useRef, useState, useCallback, useEffect } from 'react';
import Markdown from 'react-markdown';
import { MicrosoftCopilotStudioService } from './generated/services/MicrosoftCopilotStudioService';

// Agent name from Copilot Studio (Channels → Web app → connection string URL)
const AGENT_NAME = 'copilot_agent_LDkr5';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

export default function CopilotChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const resetChat = useCallback(() => {
    setError(null);
    setMessages([]);
    conversationIdRef.current = null;
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setSending(true);
    setError(null);

    try {
      const response = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
        AGENT_NAME,
        {
          message: text,
          notificationUrl: 'https://notificationurlplaceholder',
          agentName: AGENT_NAME,
        },
        conversationIdRef.current ?? undefined,
      );

      // The response data may use different casing; handle all variations
      const data = response.data as Record<string, unknown> | undefined;

      if (data) {
        // Track conversation ID for multi-turn
        const convId = (data.conversationId ?? data.ConversationId ?? data.conversationID) as string | undefined;
        if (convId) {
          conversationIdRef.current = convId;
        }

        // Extract bot reply
        const lastResponse = (data.lastResponse ?? data.LastResponse) as string | undefined;
        const responses = (data.responses ?? data.Responses) as string[] | undefined;

        if (lastResponse) {
          setMessages(prev => [...prev, { role: 'bot', text: lastResponse }]);
        } else if (responses && responses.length > 0) {
          setMessages(prev => [
            ...prev,
            ...responses.map(t => ({ role: 'bot' as const, text: t })),
          ]);
        } else {
          setMessages(prev => [...prev, { role: 'bot', text: '(No response from agent)' }]);
        }
      }
    } catch (err) {
      console.error('Copilot send failed:', err);
      setError(String(err));
    } finally {
      setSending(false);
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating chat button */}
      {!open && (
        <button className="copilot-fab" onClick={() => setOpen(true)} aria-label="Open Copilot Assistant">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat popup */}
      {open && (
        <div className="copilot-popup">
          <div className="copilot-header">
            <div className="copilot-header-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Copilot Assistant</span>
            </div>
            <div className="copilot-header-actions">
              <button className="copilot-icon-btn" onClick={resetChat} aria-label="New conversation" title="New conversation">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
              <button className="copilot-icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="copilot-messages">
            {error && (
              <div className="copilot-error">
                <p>Something went wrong.</p>
                <p className="copilot-error-detail">{error}</p>
                <button className="btn-primary btn-sm" onClick={resetChat}>Clear &amp; retry</button>
              </div>
            )}
            {messages.length === 0 && !error && (
              <div className="copilot-loading">
                <span>Ask me anything about your Jira tickets!</span>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`copilot-msg copilot-msg-${msg.role}`}>
                <div className={`copilot-msg-bubble copilot-bubble-${msg.role}`}>
                  {msg.role === 'bot' ? (
                    <Markdown>{msg.text}</Markdown>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="copilot-msg copilot-msg-bot">
                <div className="copilot-bubble-bot copilot-msg-bubble copilot-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="copilot-input-bar">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Copilot..."
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              aria-label="Send"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
