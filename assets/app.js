import { githubId } from "./github-id.js";
import { seal } from "./seal.js";
import { generatePage } from "./template.js";

const HINTS = ["'웹 채널 보안의 암호'를 입력하세요", "GitHub 아이디를 입력하세요"];
const $ = id => document.getElementById(id);
const box = $("box");
const field = $("field");
const input = $("input");
const send = $("send");
const code = $("code");
const copy = $("copy");
const copyLabel = copy.querySelector("span");
const live = $("live");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const play = (element, frames, options) => motion.matches ? null : element.animate(frames, options);

let step = 0;
let secret = null;
let busy = false;
let copying = false;
let generation = 0;
let hintTimer;
let copyTimer;
let inputAnimation;

function setBusy(value) {
  busy = value;
  input.readOnly = value;
  send.disabled = value || !input.value.trim() || box.classList.contains("done");
  box.setAttribute("aria-busy", String(value));
}

function hint(text, isError = false, quiet = false) {
  const old = field.querySelector(".ph:last-child");
  const next = Object.assign(document.createElement("span"), {
    className: "ph" + (isError ? " error" : ""), textContent: text
  });
  next.setAttribute("aria-hidden", "true");
  field.append(next);
  input.setAttribute("aria-label", text);
  live.textContent = text;
  if (old && quiet) old.remove();
  const out = old && !quiet && play(old, [
    { opacity: 1, transform: "translateY(-50%)", filter: "blur(0)" },
    { opacity: 0, transform: "translateY(-120%)", filter: "blur(6px)" }
  ], { duration: 320, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" });
  if (out) out.onfinish = () => old.remove();
  else if (old?.isConnected) old.remove();
  play(next, [
    { opacity: 0, transform: "translateY(20%)", filter: "blur(6px)" },
    { opacity: 1, transform: "translateY(-50%)", filter: "blur(0)" }
  ], { duration: 620, delay: 90, easing: "cubic-bezier(.2, 1.25, .3, 1)", fill: "backwards" });
}

async function clearTyped(current) {
  const animation = input.value && play(input, [
    { opacity: 1, transform: "none", filter: "blur(0)" },
    { opacity: 0, transform: "translateY(-12px)", filter: "blur(5px)" }
  ], { duration: 260, easing: "ease-in", fill: "forwards" });
  inputAnimation = animation;
  if (animation) await animation.finished;
  if (current !== generation) return;
  input.value = "";
  field.classList.remove("filled");
  send.disabled = true;
  if (animation) animation.cancel();
  inputAnimation = null;
}

const jelly = () => play(box, [
  { transform: "scale(1)" }, { transform: "scale(1.02, .95)" },
  { transform: "scale(.994, 1.014)" }, { transform: "scale(1)" }
], { duration: 600, easing: "ease-out", composite: "add" });

const shake = () => play(box, [
  { transform: "translateX(0)" }, { transform: "translateX(-10px)" },
  { transform: "translateX(8px)" }, { transform: "translateX(-5px)" },
  { transform: "translateX(3px)" }, { transform: "translateX(0)" }
], { duration: 480, easing: "ease-out", composite: "add" });

function morph(change) {
  const before = box.getBoundingClientRect().height;
  const beforeRadius = getComputedStyle(box).borderRadius;
  change();
  const after = box.getBoundingClientRect().height;
  const afterRadius = getComputedStyle(box).borderRadius;
  play(box, [
    { height: before + "px", borderRadius: beforeRadius },
    { height: after + "px", borderRadius: afterRadius }
  ], { duration: 780, easing: "cubic-bezier(.2, 1.12, .3, 1)" });
}

function fail(message) {
  shake();
  input.value = "";
  input.setAttribute("aria-invalid", "true");
  field.classList.remove("filled");
  send.disabled = true;
  hint(message, true, true);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint(HINTS[step]), 2600);
}

function showCode(html) {
  code.textContent = html;
  morph(() => box.classList.add("done"));
  [...box.querySelectorAll(".bar > *"), code].forEach((element, i) => play(element, [
    { opacity: 0, transform: "translateY(10px)", filter: "blur(6px)" },
    { opacity: 1, transform: "none", filter: "blur(0)" }
  ], { duration: 640, delay: 160 + i * 90, easing: "cubic-bezier(.2, 1, .3, 1)", fill: "backwards" }));
  copy.focus({ preventScroll: true });
  live.textContent = "index.html 코드가 만들어졌습니다. 복사 버튼을 누르세요.";
}

function resetCopyFeedback() {
  clearTimeout(copyTimer);
  copy.classList.remove("ok", "error");
  copyLabel.textContent = "복사";
  copy.removeAttribute("title");
}

function restart(message = HINTS[0], isError = false) {
  // Invalidate pending encryption/clipboard work before accepting new input.
  generation++;
  clearTimeout(hintTimer);
  if (inputAnimation) inputAnimation.cancel();
  inputAnimation = null;
  step = 0;
  secret = null;
  copying = false;
  resetCopyFeedback();
  copy.disabled = false;
  copy.removeAttribute("aria-busy");
  input.type = "password";
  input.value = "";
  input.removeAttribute("aria-invalid");
  field.classList.remove("filled");
  if (box.classList.contains("done")) morph(() => box.classList.remove("done"));
  code.textContent = "";
  setBusy(false);
  hint(message, isError);
  if (isError) hintTimer = setTimeout(() => hint(HINTS[0]), 3200);
  input.focus();
}

async function submit() {
  const value = input.value.trim();
  if (busy || !value || box.classList.contains("done")) return;
  const current = generation;
  clearTimeout(hintTimer);
  setBusy(true);
  try {
    if (step === 0) {
      if (value.length < 20 || /\s/.test(value)) {
        fail("암호를 그대로 붙여 넣으세요");
        return;
      }
      secret = value;
      jelly();
      await clearTyped(current);
      if (current !== generation) return;
      input.type = "text";
      step = 1;
      hint(HINTS[1], false, true);
    } else {
      const id = githubId(value);
      if (!id) {
        fail("GitHub 아이디만 입력하세요 (예: oneot)");
        return;
      }
      jelly();
      await clearTyped(current);
      if (current !== generation) return;
      const pending = seal(secret, `https://${id}.github.io`);
      secret = null;
      const sealed = await pending;
      if (current !== generation) return;
      showCode(generatePage(sealed));
    }
  } catch {
    if (current !== generation) return;
    const message = globalThis.crypto?.subtle
      ? "만들지 못했어요. 새로고침 후 다시 해 보세요"
      : "HTTPS 또는 localhost에서 열어 주세요";
    restart(message, true);
  } finally {
    if (current === generation) {
      setBusy(false);
      if (!box.classList.contains("done")) input.focus();
    }
  }
}

function legacyCopy(text) {
  const active = document.activeElement;
  const textarea = Object.assign(document.createElement("textarea"), {
    value: text, readOnly: true, tabIndex: -1
  });
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px";
  document.body.append(textarea);
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    textarea.remove();
    active?.focus({ preventScroll: true });
  }
}

async function copyCode() {
  if (copying || !box.classList.contains("done")) return;
  const current = generation;
  resetCopyFeedback();
  copying = true;
  copy.disabled = true;
  copy.setAttribute("aria-busy", "true");
  copyLabel.textContent = "복사 중";
  live.textContent = "코드를 복사하는 중입니다.";

  let copied = false;
  try {
    await navigator.clipboard.writeText(code.textContent);
    copied = true;
  } catch {
    if (current !== generation) return;
    copied = legacyCopy(code.textContent);
  }
  if (current !== generation) return;
  copying = false;
  copy.disabled = false;
  copy.removeAttribute("aria-busy");
  if (copied) {
    copy.classList.add("ok");
    copyLabel.textContent = "복사됨";
    live.textContent = "코드를 복사했습니다.";
    if (document.activeElement === document.body || document.activeElement === copy) {
      copy.focus({ preventScroll: true });
    }
    jelly();
    copyTimer = setTimeout(resetCopyFeedback, 1800);
  } else {
    copy.classList.add("error");
    copyLabel.textContent = "복사 실패";
    const message = "자동 복사에 실패했습니다. 코드를 선택해 직접 복사해 주세요.";
    copy.title = message;
    live.textContent = message;
    code.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

input.addEventListener("input", () => {
  field.classList.toggle("filled", input.value.length > 0);
  send.disabled = busy || !input.value.trim();
  if (input.hasAttribute("aria-invalid")) {
    input.removeAttribute("aria-invalid");
    clearTimeout(hintTimer);
    hint(HINTS[step], false, true);
  }
});
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    submit();
  }
});
send.addEventListener("click", submit);
$("again").addEventListener("click", () => restart());
copy.addEventListener("click", copyCode);
box.addEventListener("click", event => {
  if (!box.classList.contains("done") && !event.target.closest("button")) input.focus();
});
box.addEventListener("pointermove", event => {
  const rect = box.getBoundingClientRect();
  box.style.setProperty("--x", event.clientX - rect.left + "px");
  box.style.setProperty("--y", event.clientY - rect.top + "px");
});
