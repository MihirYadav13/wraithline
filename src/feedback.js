// "Send feedback" dialog (main menu and results screen) and the anonymous-stats toggle in Settings.
import { FEEDBACK_URL, FEEDBACK_LINK, sendFeedback, analyticsConfigured, analyticsOptedOut, setAnalyticsOptOut } from './analytics.js';

// context() returns what the form may attach besides the rating and comment: { from, map?, difficulty? }
export function bindFeedback(context) {
  const $ = (id) => document.getElementById(id);
  const opts = $('statsopt');
  opts.checked = !analyticsOptedOut();
  opts.addEventListener('change', () => setAnalyticsOptOut(!opts.checked));
  $('statstip').textContent = analyticsConfigured
    ? 'Counts only: which map and difficulty you play and how it ended. Nothing that identifies you.'
    : 'This copy of the game sends no stats.';

  const openers = document.querySelectorAll('.fbopen');
  if (!FEEDBACK_URL && !FEEDBACK_LINK) return openers.forEach((b) => b.classList.add('hidden'));
  $('fbform').classList.toggle('hidden', !FEEDBACK_URL);
  $('fblink').classList.toggle('hidden', !FEEDBACK_LINK);
  if (FEEDBACK_LINK) $('fblink').querySelector('a').href = FEEDBACK_LINK;

  let rating = 0;
  let ctx = {};
  const stars = [...$('fbstars').children];
  const paint = () => stars.forEach((s) => s.classList.toggle('on', +s.dataset.r <= rating));
  stars.forEach((s) =>
    s.addEventListener('click', () => {
      rating = +s.dataset.r;
      paint();
      $('fbsend').disabled = false;
    })
  );
  const open = () => {
    ctx = context();
    rating = 0;
    paint();
    $('fbtext').value = '';
    $('fbsend').disabled = true;
    $('fbstatus').textContent = '';
    $('fbwhat').textContent = ctx.map ? 'the map and difficulty you just played ' : '';
    $('feedback').classList.remove('hidden');
  };
  openers.forEach((b) => b.addEventListener('click', open));
  $('fbclose').addEventListener('click', () => $('feedback').classList.add('hidden'));
  $('fbsend').addEventListener('click', async () => {
    $('fbsend').disabled = true;
    $('fbstatus').textContent = 'Sending...';
    try {
      await sendFeedback({ rating, text: $('fbtext').value.trim(), ...ctx });
      $('fbstatus').textContent = 'Thank you! Your feedback was sent.';
      $('fbform').classList.add('hidden');
      setTimeout(() => {
        $('feedback').classList.add('hidden');
        $('fbform').classList.remove('hidden');
      }, 1800);
    } catch {
      $('fbstatus').innerHTML = `<span class="err">Could not send it right now.${FEEDBACK_LINK ? ' Try the link below instead.' : ''}</span>`;
      $('fbsend').disabled = false;
    }
  });
}
