// EcoFood AI — отправка ответов Google-формы в приложение.
// Куда вставлять: Google-таблица с ответами формы → Расширения → Apps Script.
//
// 1) Нажмите «Выполнить» у функции sendAll — отправит ВСЕ накопленные ответы (один раз).
// 2) Нажмите «Выполнить» у функции setup — включит автоматическую отправку новых ответов.
// Google попросит разрешения — это нормально (скрипт работает от вашего аккаунта).
// Повторный запуск безопасен: дубликаты отсекаются.

var ENDPOINT = '__ENDPOINT__';
var SECRET = '__SECRET__';

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();
}

// Срабатывает на каждый новый ответ формы
function onFormSubmit(e) {
  var nv = e.namedValues; // { 'Вопрос': ['ответ'], ... }
  var answers = {};
  Object.keys(nv).forEach(function (k) { answers[k] = (nv[k] && nv[k][0]) || ''; });
  var ts = answers['Отметка времени'] || '';
  delete answers['Отметка времени'];
  post_([{ timestamp: ts, answers: answers }]);
}

// Разовая отправка всех накопленных ответов
function sendAll() {
  var ss = SpreadsheetApp.getActive();
  var data = ss.getActiveSheet().getDataRange().getValues();
  var head = data[0];
  var tz = ss.getSpreadsheetTimeZone();
  var batch = [];
  for (var i = 1; i < data.length; i++) {
    var answers = {};
    var ts = '';
    for (var j = 0; j < head.length; j++) {
      var v = data[i][j];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, 'dd.MM.yyyy HH:mm:ss');
      if (String(head[j]).trim() === 'Отметка времени') ts = String(v);
      else answers[String(head[j])] = String(v);
    }
    batch.push({ timestamp: ts, answers: answers });
  }
  for (var k = 0; k < batch.length; k += 50) post_(batch.slice(k, k + 50));
}

function post_(batch) {
  var res = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-intake-secret': SECRET },
    payload: JSON.stringify({ batch: batch }),
    muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
