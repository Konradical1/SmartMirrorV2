import { addTodo, checkTodo, getTodos } from '../services/notionService.js';
import { setLastIntent, setScene, updateContext } from '../state.js';
import { broadcastAction, broadcastData } from '../websocket.js';

export async function refreshTodos() {
  const todos = await getTodos();
  if (todos) {
    updateContext('todos', todos);
    broadcastData({ todos });
  }
  return todos;
}

export async function handleTodo(params = {}) {
  setScene('todo');
  setLastIntent('SHOW_TODO');
  broadcastAction('SHOW_TODO');
  const todos = await refreshTodos();
  return { ok: true, data: { todos }, ui: { scene: 'todo' } };
}

export async function handleAddTodo(params = {}) {
  const title = todoTitle(params);
  if (!title) throw new Error('ADD_TODO requires a todo title.');
  await addTodo({ ...params, title });
  const todos = await refreshTodos();
  setScene('todo');
  setLastIntent('ADD_TODO');
  broadcastAction('ADD_TODO');
  return { ok: true, data: { title, todos }, ui: { scene: 'todo' } };
}

export async function handleCheckTodo(params = {}) {
  const title = todoTitle(params);
  if (!title) throw new Error('CHECK_TODO requires a todo title.');
  const checked = await checkTodo({ ...params, title });
  if (!checked) throw new Error(`Could not find ${title} on your to-do list.`);
  const todos = await refreshTodos();
  setScene('todo');
  setLastIntent('CHECK_TODO');
  broadcastAction('CHECK_TODO');
  return { ok: true, data: { title, todos }, ui: { scene: 'todo' } };
}

function todoTitle(params = {}) {
  return String(params.title || params.task || params.todo || params.item || params.text || params.name || '').trim();
}
