import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

let resolvedDatabaseId = null;

const titleProperty = process.env.NOTION_TITLE_PROPERTY || '';
const doneProperty = process.env.NOTION_DONE_PROPERTY || 'Done';
const doneStatus = process.env.NOTION_DONE_STATUS || 'Done';
const tagPropertyName = process.env.NOTION_TAG_PROPERTY || 'Tag';
const datePropertyName = process.env.NOTION_DATE_PROPERTY || 'Due';

export async function getTodos() {
  const databaseId = await resolveDatabaseId();
  if (!databaseId) return null;

  const schema = await getDatabaseSchema(databaseId);
  const title = resolveTitleProperty(schema);
  const doneType = schema[doneProperty]?.type;
  if (!doneType) throw new Error(`Notion done property "${doneProperty}" not found.`);

  const data = await notionFetch(`/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: incompleteFilter(doneType),
      page_size: 10,
    }),
  });

  const todos = data.results.map((page) => pageToTodo(page, title));
  logger.info(`Notion loaded ${todos.length} todo(s)`);
  return todos;
}

export async function addTodo({ title, tag = 'Personal', date = null }) {
  const databaseId = await resolveDatabaseId();
  if (!databaseId) return false;

  const schema = await getDatabaseSchema(databaseId);
  const titleKey = resolveTitleProperty(schema);
  const dueDate = normalizeDateInput(date);

  await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        [titleKey]: { title: [{ text: { content: title } }] },
        ...initialDoneProperty(schema[doneProperty]?.type),
        ...tagProperty(schema[tagPropertyName]?.type, tag),
        ...dateProperty(schema[datePropertyName]?.type, dueDate),
      },
    }),
  });

  return true;
}

export async function checkTodo({ title }) {
  const todos = await getTodos();
  const match = todos?.find((todo) => titleMatches(todo.title, title));
  if (!match) return false;

  const databaseId = await resolveDatabaseId();
  const schema = await getDatabaseSchema(databaseId);

  await notionFetch(`/pages/${match.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: completedDoneProperty(schema[doneProperty]?.type),
    }),
  });

  return true;
}

async function resolveDatabaseId() {
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!getToken() || !databaseId) return null;
  if (resolvedDatabaseId) return resolvedDatabaseId;

  try {
    await notionFetch(`/databases/${databaseId}`);
    resolvedDatabaseId = databaseId;
    return resolvedDatabaseId;
  } catch (error) {
    if (!error.message.includes('is a page, not a database')) throw error;
  }

  const childDatabaseId = await findFirstChildDatabase(databaseId);
  if (!childDatabaseId) throw new Error(`No child database found in Notion page ${databaseId}`);

  resolvedDatabaseId = childDatabaseId;
  logger.info(`Notion resolved child database ${childDatabaseId}`);
  return resolvedDatabaseId;
}

async function findFirstChildDatabase(blockId) {
  const data = await notionFetch(`/blocks/${blockId}/children?page_size=100`);
  return data.results?.find((block) => block.type === 'child_database')?.id || null;
}

async function getDatabaseSchema(databaseId) {
  const database = await notionFetch(`/databases/${databaseId}`);
  return database.properties || {};
}

async function notionFetch(path, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) throw new Error(`Notion failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function getToken() {
  return process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
}

function incompleteFilter(doneType) {
  if (doneType === 'checkbox') return { property: doneProperty, checkbox: { equals: false } };
  if (doneType === 'status') return { property: doneProperty, status: { does_not_equal: doneStatus } };
  if (doneType === 'select') return { property: doneProperty, select: { does_not_equal: doneStatus } };
  throw new Error(`Notion done property must be checkbox, status, or select. Got ${doneType}.`);
}

function resolveTitleProperty(schema) {
  if (titleProperty && schema[titleProperty]?.type === 'title') return titleProperty;
  return Object.entries(schema).find(([, property]) => property.type === 'title')?.[0] || titleProperty || 'Name';
}

function pageToTodo(page, titleKey) {
  const props = page.properties || {};
  const title = props[titleKey]?.title?.map((part) => part.plain_text).join('') || 'Untitled';
  const tag = props[tagPropertyName]?.select?.name || props[tagPropertyName]?.status?.name || 'Personal';
  const date = props[datePropertyName]?.date?.start ? formatShortDate(props[datePropertyName].date.start) : 'Soon';
  return { id: page.id, title, tag, date, done: false };
}

function initialDoneProperty(doneType) {
  if (doneType === 'checkbox') return { [doneProperty]: { checkbox: false } };
  return {};
}

function completedDoneProperty(doneType) {
  if (doneType === 'checkbox') return { [doneProperty]: { checkbox: true } };
  if (doneType === 'status') return { [doneProperty]: { status: { name: doneStatus } } };
  if (doneType === 'select') return { [doneProperty]: { select: { name: doneStatus } } };
  return {};
}

function tagProperty(tagType, tag) {
  if (tagType === 'select') return { [tagPropertyName]: { select: { name: tag } } };
  if (tagType === 'multi_select') return { [tagPropertyName]: { multi_select: [{ name: tag }] } };
  if (tagType === 'status') return { [tagPropertyName]: { status: { name: tag } } };
  return {};
}

function dateProperty(dateType, date) {
  if (dateType !== 'date' || !date) return {};
  return { [datePropertyName]: { date: { start: date } } };
}

function titleMatches(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a.includes(b) || b.includes(a);
}

function formatShortDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function normalizeDateInput(input) {
  if (!input) return null;

  const value = String(input)
    .trim()
    .toLowerCase()
    .replace(/^(on|this)\s+/, '');
  const today = startOfDay(new Date());

  if (!value || value === 'someday' || value === 'soon') return null;
  if (value === 'today') return formatDateKey(today);
  if (value === 'tomorrow') return formatDateKey(addDays(today, 1));

  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) return value;

  const weekdayMatch = value.match(/^(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekdayMatch) {
    const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekdayMatch[2]);
    let offset = (target - today.getDay() + 7) % 7;
    if (offset === 0 || weekdayMatch[1]) offset += 7;
    return formatDateKey(addDays(today, offset));
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Could not understand todo due date: ${input}`);
  return formatDateKey(parsed);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const __notionTest = {
  normalizeDateInput,
};
