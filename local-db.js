/* Local-only data store. No الخدمة السحابية or external backend is used. */
const COLLECTIONS = {
  TEACHERS: "teachers",
  STUDENTS: "students",
  EXAMS: "exams",
  QUESTIONS: "questions",
  ANSWER_KEYS: "answerKeys",
  ATTEMPTS: "attempts",
  ANSWERS: "answers",
  VIOLATIONS: "violations",
};

const LOCAL_DB_KEY = "english_exam_system_v1";

function _clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(_clone);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach(k => out[k] = _clone(value[k]));
    return out;
  }
  return value;
}
function _loadStore() {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (!raw) return {};
    return JSON.parse(raw, (k, v) => {
      if (v && typeof v === "object" && v.__date) return new Date(v.__date);
      return v;
    });
  } catch { return {}; }
}
function _saveStore(store) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(store, (k, v) => {
    if (v instanceof Date) return { __date: v.toISOString() };
    return v;
  }));
}
function _collection(store, name) {
  if (!store[name]) store[name] = {};
  return store[name];
}
function _resolve(v) {
  if (typeof v === "function") return v();
  return v;
}
function _applyData(data) {
  const out = _clone(data || {});
  Object.keys(out).forEach(k => { out[k] = _resolve(out[k]); });
  return out;
}

class LocalDocSnapshot {
  constructor(id, data, ref) { this.id = id; this._data = data; this.exists = !!data; this.ref = ref; }
  data() { return this.exists ? _clone(this._data) : undefined; }
}
class LocalDocRef {
  constructor(name, id) { this.name = name; this.id = id; }
  async get() {
    const store = _loadStore();
    return new LocalDocSnapshot(this.id, _collection(store, this.name)[this.id], this);
  }
  async set(data, options = {}) {
    const store = _loadStore();
    const col = _collection(store, this.name);
    const next = _applyData(data);
    col[this.id] = options.merge ? { ...(col[this.id] || {}), ...next } : next;
    _saveStore(store); return this;
  }
  async update(data) {
    const store = _loadStore();
    const col = _collection(store, this.name);
    if (!col[this.id]) throw { code: "not-found", message: "المستند غير موجود." };
    const next = _applyData(data);
    Object.keys(next).forEach(k => { if (next[k] && next[k].__localIncrement) next[k] = (Number(col[this.id][k]) || 0) + next[k].__localIncrement; });
    col[this.id] = { ...col[this.id], ...next };
    _saveStore(store); return this;
  }
  async delete() {
    const store = _loadStore();
    delete _collection(store, this.name)[this.id];
    _saveStore(store); return this;
  }
}
class LocalQuery {
  constructor(name, filters = [], order = null, limitN = null) { this.name=name; this.filters=filters; this.order=order; this.limitN=limitN; }
  where(field, op, value) { return new LocalQuery(this.name, [...this.filters, {field, op, value}], this.order, this.limitN); }
  orderBy(field, direction = "asc") { return new LocalQuery(this.name, this.filters, {field, direction}, this.limitN); }
  limit(n) { return new LocalQuery(this.name, this.filters, this.order, n); }
  async get() {
    const store = _loadStore();
    let rows = Object.entries(_collection(store, this.name)).map(([id, data]) => ({id, data}));
    rows = rows.filter(row => this.filters.every(f => {
      const actual = row.data[f.field];
      if (f.op === "==") return actual === f.value;
      if (f.op === "!=") return actual !== f.value;
      if (f.op === ">") return actual > f.value;
      if (f.op === ">=") return actual >= f.value;
      if (f.op === "<") return actual < f.value;
      if (f.op === "<=") return actual <= f.value;
      if (f.op === "array-contains") return Array.isArray(actual) && actual.includes(f.value);
      return false;
    }));
    if (this.order) {
      const {field, direction} = this.order;
      rows.sort((a,b) => {
        const av=a.data[field], bv=b.data[field];
        const ax=av instanceof Date ? av.getTime() : av, bx=bv instanceof Date ? bv.getTime() : bv;
        if (ax === bx) return 0;
        const cmp = ax < bx ? -1 : 1;
        return direction === "desc" ? -cmp : cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    const docs = rows.map(r => new LocalDocSnapshot(r.id, r.data, new LocalDocRef(this.name, r.id)));
    return { docs, empty: docs.length === 0, size: docs.length, forEach(fn){ docs.forEach(fn); } };
  }
}
class LocalCollection {
  constructor(name) { this.name=name; }
  doc(id) { return new LocalDocRef(this.name, id || simpleId()); }
  add(data) { const ref=this.doc(); return ref.set(data).then(()=>ref); }
  where(field, op, value) { return new LocalQuery(this.name).where(field, op, value); }
  orderBy(field, direction) { return new LocalQuery(this.name).orderBy(field, direction); }
  limit(n) { return new LocalQuery(this.name).limit(n); }
}
class LocalBatch {
  constructor(){ this.ops=[]; }
  set(ref,data,options){ this.ops.push(()=>ref.set(data,options)); return this; }
  update(ref,data){ this.ops.push(()=>ref.update(data)); return this; }
  delete(ref){ this.ops.push(()=>ref.delete()); return this; }
  async commit(){ for(const op of this.ops) await op(); }
}
const db = {
  collection(name){ return new LocalCollection(name); },
  batch(){ return new LocalBatch(); }
};

function localIncrement(n) { return { __localIncrement: Number(n) || 0 }; }
