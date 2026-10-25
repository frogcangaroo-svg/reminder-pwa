/**
 * 予定リマインダー PWA。GAS の Webアプリ（API）と通信して予定を登録・表示する。
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbyxOeLF5hxVsZsusQAojSvf1FJ7eB4RudlJqDtubl-yEL633q1WLqkE7TWG2eQJigG3/exec';
const TOKEN_KEY = 'reminderApiToken';

const $ = (id) => document.getElementById(id);

/** 送信先の一覧（IDから名前を引くのに使う） */
let recipients = [];

// ===== 合言葉の保存 =====

/**
 * 保存した合言葉を読む。
 * @return {string} 合言葉（なければ空文字）
 */
function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

/**
 * 合言葉を保存する。
 * @param {string} token 合言葉
 */
function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    showToast('この端末では合言葉を保存できませんでした', true);
  }
}

// ===== API 通信 =====

/**
 * 送信先と予定の一覧を取得する。
 * @return {Promise<{recipients: Object[], reminders: Object[]}>}
 */
async function fetchList() {
  const res = await fetch(`${API_URL}?token=${encodeURIComponent(getToken())}`);
  return parseResponse(res);
}

/**
 * API に操作を送る。Content-Type を付けないことで、CORS の事前確認なしに送れる。
 * @param {Object} body 送る内容（action など）
 * @return {Promise<Object>}
 */
async function postApi(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ ...body, token: getToken() }),
  });
  return parseResponse(res);
}

/**
 * API のレスポンスを読み、エラーなら例外にする。
 * @param {Response} res レスポンス
 * @return {Promise<Object>}
 */
async function parseResponse(res) {
  if (!res.ok) throw new Error(`通信エラー（${res.status}）`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '不明なエラー');
  return data;
}

// ===== 画面表示 =====

/**
 * 一覧を読み込んで画面に表示する。
 */
async function loadList() {
  if (!getToken()) {
    showSettings(true);
    return;
  }
  try {
    const data = await fetchList();
    recipients = data.recipients;
    renderRecipients();
    renderReminders(data.reminders);
  } catch (e) {
    showToast(e.message, true);
    if (e.message.includes('合言葉')) showSettings(true);
  }
}

/**
 * 送信先のチェックボックスを表示する（はじめは全員にチェック）。
 */
function renderRecipients() {
  const box = $('recipientList');
  if (recipients.length === 0) {
    box.innerHTML = '<p class="note">送信先がありません。公式アカウントを友だち追加またはグループに招待してください。</p>';
    return;
  }
  box.innerHTML = '';
  recipients.forEach((r) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = r.id;
    input.checked = true;
    const name = document.createElement('span');
    name.textContent = r.name;
    const type = document.createElement('span');
    type.className = 'badge-type';
    type.textContent = r.type;
    label.append(input, name, type);
    box.append(label);
  });
}

/**
 * 予定の一覧を表示する。
 * @param {Object[]} reminders 予定の配列
 */
function renderReminders(reminders) {
  const list = $('reminderList');
  list.innerHTML = '';
  if (reminders.length === 0) {
    list.innerHTML = '<li class="note">予定はありません</li>';
    return;
  }

  const statusClass = { '未送信': 'status-pending', '送信済み': 'status-sent', 'エラー': 'status-error' };
  reminders.forEach((r) => {
    const li = document.createElement('li');

    const head = document.createElement('div');
    head.className = 'reminder-head';
    const when = document.createElement('span');
    when.className = 'reminder-when';
    when.textContent = formatDateTime(r.datetime);
    const status = document.createElement('span');
    status.className = `status ${statusClass[r.status] || ''}`;
    status.textContent = r.status;
    head.append(when, status);

    if (r.status === '未送信') {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'cancel-button';
      cancel.textContent = '取消';
      cancel.addEventListener('click', () => cancelReminder(r));
      head.append(cancel);
    }

    const title = document.createElement('p');
    title.className = 'reminder-title';
    title.textContent = r.title;
    li.append(head, title);

    if (r.detail) {
      const detail = document.createElement('p');
      detail.className = 'reminder-detail';
      detail.textContent = r.detail;
      li.append(detail);
    }

    const to = document.createElement('p');
    to.className = 'reminder-to';
    to.textContent = '送信先：' + r.recipientIds.map((id) => recipientName(id)).join('、');
    li.append(to);

    list.append(li);
  });
}

/**
 * 送信先IDから名前を返す。
 * @param {string} id 送信先ID
 * @return {string} 名前
 */
function recipientName(id) {
  const r = recipients.find((x) => x.id === id);
  return r ? r.name : '（無効な送信先）';
}

/**
 * 'yyyy-MM-ddTHH:mm' を「10/25(土) 14:00」の形にする。
 * @param {string} text 日時文字列
 * @return {string} 表示用の日時
 */
function formatDateTime(text) {
  const [date, time] = text.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const weekday = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${weekday}) ${time}`;
}

/**
 * Date を datetime-local 用の文字列にする。
 * @param {Date} date 日時
 * @return {string} 'yyyy-MM-ddTHH:mm'
 */
function toInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 日時の初期値を「1時間後の00分」にする。
 */
function resetDatetime() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  $('datetimeInput').value = toInputValue(d);
}

/**
 * 画面下に短いメッセージを出す。
 * @param {string} message メッセージ
 * @param {boolean} [isError] エラー表示にするか
 */
function showToast(message, isError = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/**
 * 設定欄の表示・非表示を切り替える。
 * @param {boolean} visible 表示するか
 */
function showSettings(visible) {
  $('settings').hidden = !visible;
  if (visible) $('tokenInput').focus();
}

// ===== 操作 =====

/**
 * 予定を登録する。
 * @param {SubmitEvent} event フォーム送信イベント
 */
async function submitReminder(event) {
  event.preventDefault();
  const recipientIds = [...document.querySelectorAll('#recipientList input:checked')].map((i) => i.value);
  if (recipientIds.length === 0) {
    showToast('送信先を1つ以上選んでください', true);
    return;
  }

  const datetime = $('datetimeInput').value;
  if (new Date(datetime).getTime() < Date.now()) {
    showToast('過去の日時は登録できません', true);
    return;
  }

  const button = $('submitButton');
  button.disabled = true;
  try {
    await postApi({
      action: 'addReminder',
      datetime: datetime,
      title: $('titleInput').value,
      detail: $('detailInput').value,
      recipientIds: recipientIds,
    });
    showToast('登録しました');
    $('titleInput').value = '';
    $('detailInput').value = '';
    resetDatetime();
    await loadList();
  } catch (e) {
    showToast(e.message, true);
  } finally {
    button.disabled = false;
  }
}

/**
 * 未送信の予定を取り消す。
 * @param {{id: string, title: string}} reminder 予定
 */
async function cancelReminder(reminder) {
  if (!confirm(`「${reminder.title}」を取り消しますか？`)) return;
  try {
    await postApi({ action: 'cancelReminder', id: reminder.id });
    showToast('取り消しました');
    await loadList();
  } catch (e) {
    showToast(e.message, true);
  }
}

/**
 * 合言葉を保存して一覧を読み込み直す。
 */
async function saveToken() {
  const token = $('tokenInput').value.trim();
  if (!token) {
    showToast('合言葉を入力してください', true);
    return;
  }
  setToken(token);
  $('tokenInput').value = '';
  showSettings(false);
  showToast('保存しました');
  await loadList();
}

// ===== 起動 =====

$('reminderForm').addEventListener('submit', submitReminder);
$('saveTokenButton').addEventListener('click', saveToken);
$('settingsButton').addEventListener('click', () => showSettings($('settings').hidden));
$('reloadButton').addEventListener('click', loadList);

// アプリに戻ってきたときに一覧を新しくする
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadList();
});

resetDatetime();
loadList();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
