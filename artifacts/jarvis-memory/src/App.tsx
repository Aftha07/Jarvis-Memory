import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Edit3,
  History,
  LoaderCircle,
  Mic,
  MicOff,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetMemoryQueryKey,
  getGetMemorySummaryQueryKey,
  getListMemoriesQueryKey,
  useCreateMemory,
  useDeleteMemory,
  useGetMemory,
  useGetMemorySummary,
  useListMemories,
  useQueryAssistant,
  useUpdateMemory,
  type Memory,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Form } from '@/components/ui/form';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

type ComposerFields = { text: string };
type RecognitionLike = {
  start: () => void;
  stop: () => void;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

function speakReply(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

const formatDate = (value?: string) => {
  if (!value) return 'Not yet';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const formatRelative = (value?: string) => {
  if (!value) return 'Not yet';
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return 'yesterday';
  return formatDate(value);
};

function Sidebar() {
  const [location] = useLocation();
  return (
    <aside className="jarvis-sidebar hidden lg:flex">
      <Link href="/" className="brand-lockup" data-testid="link-home-brand">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span>
          <span className="brand-name">JARVIS</span>
          <span className="brand-subtitle">personal memory</span>
        </span>
      </Link>
      <div className="sidebar-rule" />
      <nav className="sidebar-nav" aria-label="Primary navigation">
        <Link href="/" className={`nav-link ${location === '/' ? 'is-active' : ''}`} data-testid="link-nav-capture">
          <Sparkles size={17} strokeWidth={1.8} />
          <span>Capture</span>
          {location === '/' && <span className="nav-dot" />}
        </Link>
        <Link href="/history" className={`nav-link ${location === '/history' ? 'is-active' : ''}`} data-testid="link-nav-history">
          <History size={17} strokeWidth={1.8} />
          <span>Memory shelf</span>
          {location === '/history' && <span className="nav-dot" />}
        </Link>
      </nav>
      <div className="sidebar-footer">
        <div className="signal-line"><span className="signal-pulse" /> listening quietly</div>
        <p>Your words stay yours.<br />Your memory stays exact.</p>
      </div>
    </aside>
  );
}

function MobileNav() {
  const [location] = useLocation();
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <Link href="/" className={`mobile-nav-link ${location === '/' ? 'is-active' : ''}`} data-testid="link-mobile-capture">
        <Sparkles size={18} />
        <span>Capture</span>
      </Link>
      <Link href="/history" className={`mobile-nav-link ${location === '/history' ? 'is-active' : ''}`} data-testid="link-mobile-history">
        <History size={18} />
        <span>Memory shelf</span>
      </Link>
    </nav>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <Sidebar />
      <main className="app-main">
        <header className="mobile-header lg:hidden">
          <Link href="/" className="brand-lockup" data-testid="link-mobile-brand">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span><span className="brand-name">JARVIS</span><span className="brand-subtitle">personal memory</span></span>
          </Link>
          <span className="header-status"><span className="signal-pulse" /> online</span>
        </header>
        {children}
      </main>
      <MobileNav />
    </div>
  );
}

function StatusPill({ children, tone = 'quiet' }: { children: ReactNode; tone?: 'quiet' | 'green' | 'gold' }) {
  return <span className={`status-pill status-${tone}`}><span className="status-dot" />{children}</span>;
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton-block ${className}`} aria-hidden="true" />;
}

function Composer() {
  const form = useForm<ComposerFields>({ defaultValues: { text: '' } });
  const text = form.watch('text');
  const [composerMode, setComposerMode] = useState<'capture' | 'ask'>('capture');
  const [isListening, setIsListening] = useState(false);
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [assistantAction, setAssistantAction] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const queryClient = useQueryClient();
  const createMemory = useCreateMemory();
  const queryAssistant = useQueryAssistant();

  const startListening = () => {
    const SpeechRecognition = (window as Window & {
      SpeechRecognition?: new () => RecognitionLike;
      webkitSpeechRecognition?: new () => RecognitionLike;
    }).SpeechRecognition || (window as Window & {
      webkitSpeechRecognition?: new () => RecognitionLike;
    }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setLocalStatus('Voice capture is not available in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.onresult = (event: unknown) => {
      const resultEvent = event as { results: { [key: number]: { [key: number]: { transcript: string } } } };
      const transcript = resultEvent.results[0]?.[0]?.transcript ?? '';
      if (transcript) form.setValue('text', `${form.getValues('text')}${form.getValues('text') ? ' ' : ''}${transcript}`, { shouldDirty: true });
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setLocalStatus(null);
  };

  const onSubmit = (values: ComposerFields) => {
    const message = values.text.trim();
    if (!message) return;
    setLocalStatus(null);
    setAssistantReply(null);
    if (composerMode === 'capture') {
      createMemory.mutate({ data: { text: message } }, {
        onSuccess: (memory) => {
          form.reset();
           setLocalStatus(`Saved ${formatTime(memory.createdAt)}`);
           speakReply('Noted.');
          queryClient.invalidateQueries({ queryKey: getListMemoriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMemorySummaryQueryKey() });
        },
        onError: () => setLocalStatus('That could not be saved. Try once more.'),
      });
    } else {
      queryAssistant.mutate({ data: { message } }, {
        onSuccess: (response) => {
          form.reset();
          setAssistantReply(response.reply);
          setAssistantAction(response.action);
           speakReply(response.reply);
          queryClient.invalidateQueries({ queryKey: getListMemoriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMemorySummaryQueryKey() });
        },
        onError: () => setLocalStatus('JARVIS could not answer just now. Try again.'),
      });
    }
  };

  const pending = createMemory.isPending || queryAssistant.isPending;
  return (
    <section className="composer-shell" aria-label="Memory capture">
      <div className="composer-topline">
        <div>
          <span className="eyebrow"><span className="eyebrow-mark" /> quick thought</span>
          <h1>Say it once.<br /><em>Keep it forever.</em></h1>
        </div>
        <div className="composer-orbit" aria-hidden="true">
          <span className="orbit-ring orbit-ring-one" /><span className="orbit-ring orbit-ring-two" /><span className="orbit-core"><Sparkles size={21} /></span>
        </div>
      </div>
      <p className="intro-copy">A quiet place for the things you mean to remember. Tell JARVIS what matters, and your exact words will be waiting when you need them.</p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="capture-card">
          <div className="mode-switch" role="tablist" aria-label="Composer mode">
            <button type="button" className={composerMode === 'capture' ? 'mode-button is-selected' : 'mode-button'} onClick={() => setComposerMode('capture')} data-testid="button-mode-capture">Save a thought</button>
            <button type="button" className={composerMode === 'ask' ? 'mode-button is-selected' : 'mode-button'} onClick={() => setComposerMode('ask')} data-testid="button-mode-ask">Ask JARVIS</button>
          </div>
          <div className="textarea-wrap">
            <textarea
              {...form.register('text')}
              className="memory-textarea"
              placeholder={composerMode === 'capture' ? 'I need to remember…' : 'What are you trying to find?'}
              rows={4}
              data-testid="input-memory-composer"
              aria-label={composerMode === 'capture' ? 'Thought to save' : 'Question for JARVIS'}
            />
            <div className="textarea-footer">
              <span className="exact-note"><Check size={14} /> original wording preserved</span>
              <span className="character-count">{text?.length ?? 0}</span>
            </div>
          </div>
          <div className="composer-actions">
            <button type="button" className={`voice-button ${isListening ? 'is-listening' : ''}`} onClick={startListening} data-testid="button-voice-capture">
              {isListening ? <MicOff size={17} /> : <Mic size={17} />}
              <span>{isListening ? 'Listening…' : 'Speak instead'}</span>
            </button>
            <button type="submit" className="primary-submit" disabled={pending || !text?.trim()} data-testid="button-submit-memory">
              {pending ? <LoaderCircle size={17} className="spin" /> : composerMode === 'capture' ? <Archive size={17} /> : <Send size={17} />}
              <span>{pending ? 'Working…' : composerMode === 'capture' ? 'Save memory' : 'Ask JARVIS'}</span>
              {!pending && <ArrowUpRight size={16} />}
            </button>
          </div>
        </form>
      </Form>
      {(localStatus || assistantReply) && (
        <div className={`response-card ${localStatus ? 'is-status' : ''}`} data-testid="status-composer-response">
          <span className="response-icon">{localStatus ? <Check size={16} /> : <Sparkles size={16} />}</span>
          <div>
            <span className="response-label">{localStatus ? 'JARVIS status' : assistantAction === 'no_match' ? 'Nothing surfaced' : 'JARVIS says'}</span>
            <p>{localStatus || assistantReply}</p>
          </div>
          {assistantReply && <button type="button" className="icon-button" onClick={() => setAssistantReply(null)} aria-label="Dismiss response" data-testid="button-dismiss-response"><X size={16} /></button>}
        </div>
      )}
    </section>
  );
}

function LatestMemory({ memory }: { memory: Memory | null | undefined }) {
  if (!memory) {
    return (
      <section className="latest-card latest-empty" data-testid="empty-latest-memory">
        <div className="empty-orb"><BookOpen size={22} /></div>
        <div>
          <span className="eyebrow">your latest memory</span>
          <h2>Nothing here yet.</h2>
          <p>When something is worth keeping, place it above. This space will hold your most recent thought.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="latest-card" data-testid={`card-latest-memory-${memory.id}`}>
      <div className="latest-heading">
        <div><span className="eyebrow">your latest memory</span><StatusPill tone="green">safely held</StatusPill></div>
        <span className="latest-time">{formatRelative(memory.createdAt)}</span>
      </div>
      <blockquote>{memory.currentText}</blockquote>
      <div className="memory-meta"><span>{memory.category || 'thought'}</span><span className="meta-separator" /><span>{formatDate(memory.createdAt)} at {formatTime(memory.createdAt)}</span></div>
    </section>
  );
}

function Home() {
  const summaryQuery = useGetMemorySummary({ query: { queryKey: getGetMemorySummaryQueryKey() } });
  const latestQuery = useListMemories({ limit: 5 }, { query: { queryKey: getListMemoriesQueryKey({ limit: 5 }) } });
  const summary = summaryQuery.data;
  const latest = summary?.latest ?? latestQuery.data?.[0] ?? null;
  return (
    <div className="page page-home">
      <div className="content-column">
        <Composer />
        <div className="home-lower">
          <LatestMemory memory={latest} />
          <section className="status-card" data-testid="card-memory-status">
            <div className="status-card-heading"><span className="eyebrow">memory pulse</span><StatusPill tone="green">online</StatusPill></div>
            {summaryQuery.isLoading ? <div className="status-skeletons"><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /></div> : summaryQuery.isError ? (
              <div className="inline-error" data-testid="error-memory-summary">Could not read the pulse. <button type="button" onClick={() => summaryQuery.refetch()} data-testid="button-retry-summary">Retry</button></div>
            ) : (
              <div className="pulse-grid">
                <div><strong>{summary?.total ?? 0}</strong><span>memories held</span></div>
                <div><strong>{summary?.today ?? 0}</strong><span>saved today</span></div>
              </div>
            )}
            <div className="status-caption"><span className="pulse-line" /> listening for the next thing worth keeping</div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MemoryDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detailQuery = useGetMemory(id, { query: { enabled: Boolean(id), queryKey: getGetMemoryQueryKey(id) } });
  const updateMemory = useUpdateMemory();
  const deleteMemory = useDeleteMemory();
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const memory = detailQuery.data;

  useEffect(() => {
    if (memory) setEditedText(memory.currentText);
  }, [memory]);

  const saveEdit = () => {
    if (!editedText.trim()) return;
    updateMemory.mutate({ id, data: { currentText: editedText.trim() } }, {
      onSuccess: () => {
        setIsEditing(false);
        queryClient.invalidateQueries({ queryKey: getGetMemoryQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListMemoriesQueryKey() });
      },
    });
  };

  const removeMemory = () => {
    if (!window.confirm('Delete this memory permanently?')) return;
    deleteMemory.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMemoriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMemorySummaryQueryKey() });
        onClose();
      },
    });
  };

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-panel" role="dialog" aria-modal="true" aria-label="Memory details">
        <button type="button" className="detail-close icon-button" onClick={onClose} aria-label="Close memory details" data-testid="button-close-memory-detail"><X size={18} /></button>
        {detailQuery.isLoading ? <div className="detail-loading"><SkeletonBlock className="h-5 w-24" /><SkeletonBlock className="h-24 w-full" /><SkeletonBlock className="h-4 w-40" /></div> : detailQuery.isError || !memory ? (
          <div className="detail-error"><Archive size={24} /><h2>Memory unavailable</h2><p>This memory may have moved or been removed.</p><button type="button" className="secondary-button" onClick={onClose} data-testid="button-close-memory-error">Return to shelf</button></div>
        ) : (
          <>
            <div className="detail-heading"><div><span className="eyebrow">memory detail</span><span className="detail-date">{formatDate(memory.createdAt)} · {formatTime(memory.createdAt)}</span></div><StatusPill>{memory.category || 'thought'}</StatusPill></div>
            <div className="detail-original"><span>ORIGINAL WORDING</span><p>{memory.originalText}</p></div>
            <div className="detail-current">
              <div className="detail-current-heading"><span>WORKING VERSION</span>{!isEditing && <button type="button" className="text-button" onClick={() => setIsEditing(true)} data-testid="button-edit-memory"><Edit3 size={14} /> Edit</button>}</div>
              {isEditing ? <><textarea value={editedText} onChange={(event) => setEditedText(event.target.value)} className="edit-textarea" data-testid="input-edit-memory" /><div className="edit-actions"><button type="button" className="secondary-button" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">Cancel</button><button type="button" className="primary-small" onClick={saveEdit} disabled={updateMemory.isPending} data-testid="button-save-edit">{updateMemory.isPending ? 'Saving…' : 'Save correction'}</button></div></> : <p>{memory.currentText}</p>}
            </div>
            <div className="detail-footer"><span>Updated {formatRelative(memory.updatedAt)}</span><button type="button" className="delete-button" onClick={removeMemory} disabled={deleteMemory.isPending} data-testid="button-delete-memory"><Trash2 size={14} /> {deleteMemory.isPending ? 'Deleting…' : 'Delete memory'}</button></div>
          </>
        )}
      </section>
    </div>
  );
}

function MemoryRow({ memory, onOpen }: { memory: Memory; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="memory-row" onClick={() => onOpen(memory.id)} data-testid={`button-memory-row-${memory.id}`}>
      <div className="memory-row-mark"><span /></div>
      <div className="memory-row-content"><div className="memory-row-top"><span className="memory-category">{memory.category || 'thought'}</span><span>{formatDate(memory.createdAt)}</span></div><p>{memory.currentText}</p><div className="memory-row-bottom"><span>{formatTime(memory.createdAt)}</span><span className="row-arrow"><ChevronRight size={15} /></span></div></div>
    </button>
  );
}

function HistoryPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = useMemo(() => ({ search: search.trim() || undefined, limit: 100 }), [search]);
  const memoriesQuery = useListMemories(params, { query: { queryKey: getListMemoriesQueryKey(params) } });
  const items = memoriesQuery.data ?? [];
  return (
    <div className="page page-history">
      <div className="content-column">
        <header className="history-heading">
          <div><span className="eyebrow"><span className="eyebrow-mark" /> memory shelf</span><h1>Everything you<br /><em>meant to keep.</em></h1></div>
          <Link href="/" className="new-memory-button" data-testid="link-new-memory"><Plus size={16} /> New memory</Link>
        </header>
        <div className="history-toolbar">
          <div className="search-field"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your memories" aria-label="Search memories" data-testid="input-search-memories" />{search && <button type="button" onClick={() => setSearch('')} className="clear-search" aria-label="Clear search" data-testid="button-clear-search"><X size={14} /></button>}</div>
          <span className="result-count">{memoriesQuery.isLoading ? 'Looking…' : `${items.length} ${items.length === 1 ? 'memory' : 'memories'}`}</span>
        </div>
        {memoriesQuery.isLoading ? <div className="memory-list" data-testid="loading-memory-list">{[1, 2, 3].map((item) => <div className="memory-row skeleton-row" key={item}><SkeletonBlock className="h-9 w-9 rounded-full" /><div className="w-full"><SkeletonBlock className="h-3 w-32" /><SkeletonBlock className="mt-3 h-5 w-4/5" /><SkeletonBlock className="mt-3 h-3 w-16" /></div></div>)}</div> : memoriesQuery.isError ? (
          <div className="history-state error-state" data-testid="error-memory-list"><div className="empty-orb"><Archive size={22} /></div><h2>The shelf is quiet.</h2><p>We could not reach your memories this time.</p><button type="button" className="secondary-button" onClick={() => memoriesQuery.refetch()} data-testid="button-retry-memory-list">Try again</button></div>
        ) : items.length === 0 ? (
          <div className="history-state" data-testid="empty-memory-list"><div className="empty-orb"><Search size={22} /></div><h2>{search ? 'No match found.' : 'Your shelf is waiting.'}</h2><p>{search ? 'Try another phrase or clear the search.' : 'Saved thoughts will appear here, newest first.'}</p>{search && <button type="button" className="secondary-button" onClick={() => setSearch('')} data-testid="button-empty-clear-search">Clear search</button>}</div>
        ) : <div className="memory-list" data-testid="memory-list">{items.map((memory) => <MemoryRow key={memory.id} memory={memory} onOpen={setSelectedId} />)}</div>}
      </div>
      {selectedId && <MemoryDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function Router() {
  return (
    <AppShell>
      <ErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/history" component={HistoryPage} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;