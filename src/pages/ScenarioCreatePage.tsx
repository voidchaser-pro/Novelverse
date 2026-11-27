import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Save, Send, Eye, X, Link2, BookOpen, Users, Star, AlertCircle, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { EmptyState } from '@/components/UI';
import { createScenario, updateScenario, submitScenarioForReview, fetchScenarioById } from '@/lib/scenarios';
import type { ScenarioNode, ScenarioNodeChoice, ScenarioCharacter, Novel } from '@/types';

const COVER_OPTIONS = [
  'from-primary-700 to-secondary-800',
  'from-secondary-700 to-primary-900',
  'from-primary-600 to-secondary-700',
  'from-accent-600 to-primary-800',
  'from-secondary-600 to-accent-800',
];

const AVATAR_OPTIONS = ['🐉', '🦊', '🐯', '🦅', '🐺', '👑', '🔮', '⚔️', '🛡️', '🌙', '⭐', '🔥'];

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeNode(title = 'New Passage'): ScenarioNode {
  return {
    id: makeId('node'),
    title,
    text: '',
    isEnding: false,
    choices: [],
  };
}

function makeChoice(text: string, nextNodeId: string): ScenarioNodeChoice {
  return { id: makeId('choice'), text, nextNodeId };
}

export function ScenarioCreatePage() {
  const { pageParams, navigate, catalog, authUser, isAdmin } = useApp();
  const editingId = pageParams.scenarioId;

  const [novelId, setNovelId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverColor, setCoverColor] = useState(COVER_OPTIONS[0]);
  const [nodes, setNodes] = useState<ScenarioNode[]>([makeNode('Beginning')]);
  const [startNodeId, setStartNodeId] = useState(nodes[0].id);
  const [characters, setCharacters] = useState<ScenarioCharacter[]>([]);
  const [xpReward, setXpReward] = useState(100);
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0].id);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editingId));
  const [showPreview, setShowPreview] = useState(false);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  const endingsCount = useMemo(() => nodes.filter((n) => n.isEnding).length, [nodes]);

  const loadExisting = useCallback(async () => {
    if (!editingId) return;
    try {
      const sc = await fetchScenarioById(editingId);
      if (!sc) {
        setError('Scenario not found.');
        return;
      }
      setNovelId(sc.novel_id);
      setTitle(sc.title);
      setDescription(sc.description ?? '');
      setCoverColor(sc.cover_color);
      setNodes(sc.nodes.length > 0 ? sc.nodes : [makeNode('Beginning')]);
      setStartNodeId(sc.start_node_id);
      setCharacters(sc.characters);
      setXpReward(sc.xp_reward);
      setSelectedNodeId(sc.start_node_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load scenario.');
    } finally {
      setLoadingExisting(false);
    }
  }, [editingId]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  // Auto-select first node if none selected
  useEffect(() => {
    if (!selectedNode && nodes.length > 0) {
      setSelectedNodeId(nodes[0].id);
    }
  }, [selectedNode, nodes]);

  const updateNode = useCallback((id: string, patch: Partial<ScenarioNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const addNode = useCallback(() => {
    const node = makeNode(`Passage ${nodes.length + 1}`);
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
  }, [nodes.length]);

  const deleteNode = useCallback((id: string) => {
    if (nodes.length <= 1) return;
    setNodes((prev) => {
      const filtered = prev.filter((n) => n.id !== id);
      // Fix any choices pointing to deleted node
      return filtered.map((n) => ({
        ...n,
        choices: n.choices.filter((c) => c.nextNodeId !== id),
      }));
    });
    if (startNodeId === id) {
      setStartNodeId(nodes.find((n) => n.id !== id)?.id ?? '');
    }
    if (selectedNodeId === id) {
      setSelectedNodeId(nodes.find((n) => n.id !== id)?.id ?? '');
    }
  }, [nodes, startNodeId, selectedNodeId]);

  const addChoice = useCallback((nodeId: string) => {
    const target = nodes.find((n) => n.id !== nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.isEnding) return;
    const choice = makeChoice('New choice', target?.id ?? '');
    updateNode(nodeId, { choices: [...(node.choices ?? []), choice] });
  }, [nodes, updateNode]);

  const updateChoice = useCallback((nodeId: string, choiceId: string, patch: Partial<ScenarioNodeChoice>) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    updateNode(nodeId, {
      choices: node.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)),
    });
  }, [nodes, updateNode]);

  const deleteChoice = useCallback((nodeId: string, choiceId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    updateNode(nodeId, { choices: node.choices.filter((c) => c.id !== choiceId) });
  }, [nodes, updateNode]);

  const addCharacter = useCallback(() => {
    setCharacters((prev) => [...prev, { id: makeId('char'), name: '', description: '', avatar: AVATAR_OPTIONS[prev.length % AVATAR_OPTIONS.length] }]);
  }, []);

  const updateCharacter = useCallback((id: string, patch: Partial<ScenarioCharacter>) => {
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const deleteCharacter = useCallback((id: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const validate = useCallback((): string | null => {
    if (!novelId) return 'Please select a novel.';
    if (!title.trim()) return 'Please enter a title.';
    if (nodes.length === 0) return 'Please add at least one passage.';
    const start = nodes.find((n) => n.id === startNodeId);
    if (!start) return 'Start passage is missing.';
    for (const node of nodes) {
      if (!node.title.trim()) return `Passage "${node.id}" needs a title.`;
      if (!node.text.trim()) return `Passage "${node.title}" needs story text.`;
      if (!node.isEnding) {
        if (node.choices.length === 0) return `Passage "${node.title}" needs at least one choice or must be marked as an ending.`;
        for (const choice of node.choices) {
          if (!choice.text.trim()) return 'All choices need text.';
          if (!nodes.find((n) => n.id === choice.nextNodeId)) return `Choice "${choice.text}" points to a missing passage.`;
        }
      }
    }
    if (endingsCount === 0) return 'Please mark at least one passage as an ending.';
    return null;
  }, [novelId, title, nodes, startNodeId, endingsCount]);

  const buildDraft = useCallback(() => ({
    novel_id: novelId,
    title: title.trim(),
    description: description.trim() || null,
    cover_color: coverColor,
    start_node_id: startNodeId,
    nodes,
    characters,
    xp_reward: xpReward,
    endings_count: endingsCount,
  }), [novelId, title, description, coverColor, startNodeId, nodes, characters, xpReward, endingsCount]);

  const handleSave = useCallback(async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (editingId) {
        await updateScenario(editingId, buildDraft());
        setSuccessMsg('Scenario saved.');
      } else {
        const id = await createScenario(buildDraft());
        setSuccessMsg('Scenario created as draft.');
        navigate('scenario-create', { scenarioId: id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save scenario.');
    } finally {
      setSaving(false);
    }
  }, [validate, editingId, buildDraft, navigate]);

  const handleSubmit = useCallback(async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await updateScenario(editingId, buildDraft());
        await submitScenarioForReview(editingId);
      } else {
        const id = await createScenario(buildDraft());
        await submitScenarioForReview(id);
        navigate('scenario-create', { scenarioId: id });
      }
      setSuccessMsg('Scenario submitted for review!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit scenario.');
    } finally {
      setSubmitting(false);
    }
  }, [validate, editingId, buildDraft, navigate]);

  if (!authUser) {
    return (
      <EmptyState
        icon={<BookOpen className="w-7 h-7" />}
        title="Sign in required"
        description="You need an account to create interactive scenarios."
        action={<button onClick={() => navigate('auth')} className="btn-primary">Sign in</button>}
      />
    );
  }

  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate('scenarios')}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(true)} className="btn-ghost" disabled={nodes.length === 0}>
            <Eye className="w-4 h-4" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-outline">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>
          <button onClick={handleSubmit} disabled={submitting} className="btn-primary">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit
          </button>
        </div>
      </div>

      <h1 className="font-display font-extrabold text-2xl text-slate-800 dark:text-slate-100">
        {editingId ? 'Edit Scenario' : 'Create Interactive Scenario'}
      </h1>

      {/* Error / success */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-error-50 dark:bg-error-950/30 border border-error-200 dark:border-error-800/50">
          <AlertCircle className="w-5 h-5 text-error-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-success-50 dark:bg-success-950/30 border border-success-200 dark:border-success-800/50">
          <Star className="w-5 h-5 text-success-500 flex-shrink-0" />
          <p className="text-sm text-success-700 dark:text-success-400">{successMsg}</p>
        </div>
      )}

      {/* Meta section */}
      <div className="glass-card p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Source Novel <span className="text-error-500">*</span>
          </label>
          <select
            value={novelId}
            onChange={(e) => setNovelId(e.target.value)}
            className="input-field"
          >
            <option value="">Select a novel…</option>
            {catalog.map((n: Novel) => (
              <option key={n.id} value={n.id}>{n.title} — {n.author}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Scenario Title <span className="text-error-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Forgotten Path"
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short teaser for your scenario…"
            rows={2}
            className="input-field resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Cover Colour
            </label>
            <div className="flex gap-2 flex-wrap">
              {COVER_OPTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => setCoverColor(g)}
                  className={`w-10 h-10 rounded-lg bg-gradient-to-br ${g} transition-all ${coverColor === g ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              XP Reward
            </label>
            <input
              type="number"
              value={xpReward}
              onChange={(e) => setXpReward(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Characters section */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-500" />
            Characters
          </h2>
          <button onClick={addCharacter} className="btn-ghost !px-3 !py-1.5 text-sm">
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
        {characters.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No characters yet. Add one to enrich your story.</p>
        ) : (
          <div className="space-y-2">
            {characters.map((char) => (
              <div key={char.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <select
                  value={char.avatar}
                  onChange={(e) => updateCharacter(char.id, { avatar: e.target.value })}
                  className="w-12 px-1 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-lg text-center"
                >
                  {AVATAR_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    type="text"
                    value={char.name}
                    onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
                    placeholder="Character name"
                    className="input-field !py-2 !text-sm"
                  />
                  <input
                    type="text"
                    value={char.description}
                    onChange={(e) => updateCharacter(char.id, { description: e.target.value })}
                    placeholder="Short description"
                    className="input-field !py-2 !text-sm"
                  />
                </div>
                <button onClick={() => deleteCharacter(char.id)} className="p-2 text-slate-400 hover:text-error-500 transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Node editor */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary-500" />
            Story Passages
          </h2>
          <button onClick={addNode} className="btn-ghost !px-3 !py-1.5 text-sm">
            <Plus className="w-4 h-4" />
            Add Passage
          </button>
        </div>

        {/* Node list */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => setSelectedNodeId(node.id)}
              className={`chip flex-shrink-0 transition-all ${
                selectedNodeId === node.id
                  ? 'bg-primary-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {node.isEnding && <Star className="w-3 h-3" />}
              {node.title || 'Untitled'}
              {node.id === startNodeId && <span className="px-1 rounded text-[10px] bg-white/20">Start</span>}
            </button>
          ))}
        </div>

        {/* Selected node editor */}
        {selectedNode && (
          <div key={selectedNode.id} className="space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 animate-fade-in">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={selectedNode.title}
                onChange={(e) => updateNode(selectedNode.id, { title: e.target.value })}
                placeholder="Passage title"
                className="input-field !py-2 font-semibold"
              />
              {nodes.length > 1 && (
                <button onClick={() => deleteNode(selectedNode.id)} className="p-2.5 text-slate-400 hover:text-error-500 transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <textarea
              value={selectedNode.text}
              onChange={(e) => updateNode(selectedNode.id, { text: e.target.value })}
              placeholder="Write the story passage here…"
              rows={5}
              className="input-field resize-none font-serif"
            />
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedNode.isEnding}
                  onChange={(e) => updateNode(selectedNode.id, { isEnding: e.target.checked, choices: e.target.checked ? [] : selectedNode.choices })}
                  className="w-4 h-4 rounded accent-primary-600"
                />
                Mark as ending
              </label>
              {nodes.length > 1 && (
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="startNode"
                    checked={selectedNode.id === startNodeId}
                    onChange={() => setStartNodeId(selectedNode.id)}
                    className="w-4 h-4 accent-primary-600"
                  />
                  Set as start
                </label>
              )}
              {selectedNode.isEnding && (
                <input
                  type="text"
                  value={selectedNode.endingLabel ?? ''}
                  onChange={(e) => updateNode(selectedNode.id, { endingLabel: e.target.value })}
                  placeholder="Ending label (e.g. The Hero's Path)"
                  className="input-field !py-2 !text-sm flex-1 min-w-[160px]"
                />
              )}
            </div>

            {/* Choices editor */}
            {!selectedNode.isEnding && (
              <div className="space-y-2 pt-2 border-t border-slate-200/50 dark:border-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Choices
                  </span>
                  <button onClick={() => addChoice(selectedNode.id)} className="btn-ghost !px-2.5 !py-1 text-xs">
                    <Plus className="w-3.5 h-3.5" />
                    Add Choice
                  </button>
                </div>
                {selectedNode.choices.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Add choices to branch the story, or mark this passage as an ending.</p>
                )}
                {selectedNode.choices.map((choice) => (
                  <div key={choice.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={choice.text}
                      onChange={(e) => updateChoice(selectedNode.id, choice.id, { text: e.target.value })}
                      placeholder="Choice text"
                      className="input-field !py-2 !text-sm flex-1"
                    />
                    <select
                      value={choice.nextNodeId}
                      onChange={(e) => updateChoice(selectedNode.id, choice.id, { nextNodeId: e.target.value })}
                      className="input-field !py-2 !text-sm w-40 flex-shrink-0"
                    >
                      {nodes.map((n) => (
                        <option key={n.id} value={n.id}>{n.title || 'Untitled'}{n.isEnding ? ' ★' : ''}</option>
                      ))}
                    </select>
                    <button onClick={() => deleteChoice(selectedNode.id, choice.id)} className="p-2 text-slate-400 hover:text-error-500 transition-colors flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {showPreview && (
        <PreviewModal
          title={title || 'Untitled Scenario'}
          nodes={nodes}
          startNodeId={startNodeId}
          characters={characters}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

function PreviewModal({
  title,
  nodes,
  startNodeId,
  characters,
  onClose,
}: {
  title: string;
  nodes: ScenarioNode[];
  startNodeId: string;
  characters: ScenarioCharacter[];
  onClose: () => void;
}) {
  const [currentNodeId, setCurrentNodeId] = useState(startNodeId);
  const currentNode = nodes.find((n) => n.id === currentNodeId) ?? null;
  const relevantChars = characters.filter(
    (c) => currentNode?.text.includes(c.name) || currentNode?.title.includes(c.name)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="glass-card max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg text-slate-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="btn-ghost !px-2 !py-2"><X className="w-5 h-5" /></button>
        </div>
        {currentNode && (
          <div key={currentNode.id} className="space-y-4 animate-fade-in-up">
            <h3 className="font-display font-bold text-base text-slate-800 dark:text-slate-100">{currentNode.title}</h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-serif whitespace-pre-wrap">{currentNode.text}</p>
            {relevantChars.length > 0 && (
              <div className="space-y-2">
                {relevantChars.map((char) => (
                  <div key={char.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-lg">{char.avatar}</span>
                    <div>
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{char.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{char.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {currentNode.isEnding ? (
              <div className="p-4 rounded-xl bg-accent-50 dark:bg-accent-950/30 border border-accent-300/40 dark:border-accent-800/40">
                <p className="font-bold text-accent-700 dark:text-accent-300 flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  {currentNode.endingLabel ?? 'The End'}
                </p>
                <button onClick={() => setCurrentNodeId(startNodeId)} className="btn-outline mt-3 w-full">
                  Restart Preview
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {currentNode.choices.map((choice, idx) => (
                  <button
                    key={choice.id}
                    onClick={() => setCurrentNodeId(choice.nextNodeId)}
                    className="w-full text-left p-3 rounded-xl border-2 border-slate-200 dark:border-slate-800 hover:border-primary-400 dark:hover:border-primary-600 transition-colors"
                  >
                    <span className="text-sm text-slate-700 dark:text-slate-200">{idx + 1}. {choice.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
