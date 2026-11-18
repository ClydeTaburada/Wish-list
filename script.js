/* ==========================================================================
   Secret Santa ("Manito / Manita") Gift Guide — Script
   Modules:
   1. CONFIG
   2. DIALOGUE
   3. Utilities (storage, reduced motion, formatting, role sync)
   4. Welcome Gate (interactive 1st page: Name -> Gender -> Manito / Manita)
   5. Avatar State Machine (poses, tap boop, eye tracking, minimize/restore)
   6. Speech & Typewriter (aria-live, quick-reply grid toggle, ask fallback)
   7. Guided Tour (4-step walkthrough with spotlight & keyboard support)
   8. Scroll Observers & Flight Path (reveal, scroll awareness, track progress)
   9. Checklist & Celebration (persistence, burst, Mission ready)
   10. Starfield Canvas (3 depth layers, capped stars, visibility pause)
   11. Initialization & Orchestration
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONFIG — Edit these settings to customize the page
   ========================================================================== */

const CONFIG = {
  // Paste your TikTok Shop item URL here. Leave empty ('') for the "coming soon" state.
  tiktokUrl: 'https://vt.tiktok.com/ZS9P1nyWbhnu7-whfTj/',

  // Name of the astronaut mascot shown in the speech bubble and dialogue.
  guideName: 'Cosmo',

  // Reply used when the visitor asks something outside the scripted topics.
  fallbackReply: 'Good question! I’m not sure about that one. Please ask Clyde.',

  // Search fallback phrase shown if the TikTok link does not open directly.
  searchFallback: 'UrbanSoleil black leather shoes for men glossy',

  // Idle nudge timing (ms) and maximum hints per visit.
  idleTimeoutMs: 15000,
  maxIdleNudges: 2,

  // Minimum time (ms) between avatar tap reactions.
  tapCooldownMs: 1000,

  // Typewriter speed (ms per character). Disabled when prefers-reduced-motion is active.
  typewriterCharMs: 22,

  // Background music settings. Leave musicUrl empty ('') to use the built-in
  // space music-box synth, or set a path like 'assets/music.mp3' for your own track.
  musicEnabled: true,
  musicUrl: '',
  musicVolume: 0.68,
};

/* ==========================================================================
   2. DIALOGUE — All scripted lines in one place
   Placeholders:
     {guideName} -> CONFIG.guideName (e.g., Cosmo)
     {role}      -> "manito" (male) or "manita" (female)
     {Role}      -> "Manito" (male) or "Manita" (female)
     {name}      -> saved name, or {role}
     {nameComma} -> ", <name>" if a name was saved, or ""
   ========================================================================== */

const DIALOGUE = {
  introGreeting: 'Welcome aboard{nameComma}! I’m {guideName} — tap “Questions” anytime or start the guided tour.',
  introReturning: 'Welcome back, {Role}{nameComma}! Ready for size 41 in glossy black?',

  quickReplies: {
    size: 'My shoe size is 41{nameComma}. Keep the quantity at 1.',
    color: 'Black, glossy slip-on — pick the first color option with the red border.',
    where: 'Right at the top! Tap “Open the shoes on TikTok” to jump to the listing.',
    link: 'If the link won’t open, search “UrbanSoleil black leather shoes for men glossy” in TikTok Shop.',
    price: 'Prices change on TikTok, so check the product page for the current price.',
  },

  tourSteps: {
    1: 'Open the TikTok link. You should see these black glossy shoes from UrbanSoleil, a Star Shop.',
    2: 'Choose the color BLACK — pick the first one with the red border highlighted here.',
    3: 'Tap size 41 and keep quantity at 1. Boxes with dashed lines are not available.',
    4: 'Add to cart and pay. Check the delivery date is before our exchange day, and keep it a secret!',
  },
  tourFinished: 'Mission briefing complete{nameComma}! Tick the checklist below before you pay.',
  tourExited: 'Tour paused! Tap “Questions” or “Guided tour” anytime to jump back in.',

  scrollSteps: {
    1: 'Step 1: check that the shop says UrbanSoleil, a Star Shop.',
    2: 'Step 2: choose BLACK — the first option with the red border.',
    3: 'Step 3: tap size 41 and keep quantity at 1.',
    4: 'Last step: check the delivery arrives before exchange day. Keep it a secret!',
  },

  tapReactions: [
    'Boop! Quick reminder: size 41, glossy black.',
    'Hey, watch the antenna! Pick the first BLACK option.',
    'Mission sensors confirm: you’re going to be an awesome {role}.',
    'Zero-gravity tip: keep quantity at 1 and skip the dashed size boxes.',
    'My lips are sealed — Secret Santa protocol is active.',
  ],

  checklistTicks: [
    'Nice! One item confirmed.',
    'Halfway there — looking sharp{nameComma}!',
    'Three out of four! Almost ready for launch.',
  ],
  checklistComplete: 'All four ticked — mission ready{nameComma}! Thank you so much, {role}!',
  missionReadyNote:
    'Thank you so much for taking care of this{nameComma}. I can’t wait for exchange day — your secret is safe with {guideName}.',

  idleNudges: [
    'Need a hand{nameComma}? Tap “Guided tour” and I’ll walk you through every step.',
    'Still checking things out, {role}? Tap “Questions” anytime and I’ve got you covered.',
  ],

  tiktokTap: 'Good luck{nameComma}! Remember: BLACK, size 41, quantity 1.',
};

/* ==========================================================================
   3. Utilities — Safe localStorage, reduced motion, formatting, role sync
   ========================================================================== */

const STORAGE_KEYS = {
  userName: 'manito_guide_name',
  userRole: 'manito_guide_role',
  onboarded: 'manito_guide_onboarded',
  minimized: 'manito_guide_minimized',
  checklist: 'manito_guide_checklist',
  musicMuted: 'manito_guide_music_muted',
};

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointerQuery = window.matchMedia('(pointer: fine)');

function prefersReducedMotion() {
  return reducedMotionQuery.matches;
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {
    // Ignore storage errors (private browsing, quota, sandboxed iframes).
  }
}

const appState = {
  userName: '',
  userRole: 'manito', // 'manito' (male) or 'manita' (female)
  isOnboarding: true,
  isMinimized: false,
  isChipsOpen: false,
  isTourActive: false,
  tourStep: 1,
  idleNudgeCount: 0,
  tapIndex: 0,
  lastTapAt: 0,
  poseResetTimerId: null,
  highlightTimerId: null,
  idleTimerId: null,
  typewriterTimerId: null,
  spokenSteps: new Set(),
};

function getRoleWords() {
  const isManita = appState.userRole === 'manita';
  return {
    role: isManita ? 'manita' : 'manito',
    Role: isManita ? 'Manita' : 'Manito',
  };
}

function formatLine(template) {
  const { role, Role } = getRoleWords();
  const cleanName = appState.userName.trim();
  const displayName = cleanName || role;
  const nameComma = cleanName ? `, ${cleanName}` : '';
  return template
    .replace(/\{guideName\}/g, CONFIG.guideName)
    .replace(/\{role\}/g, role)
    .replace(/\{Role\}/g, Role)
    .replace(/\{name\}/g, displayName)
    .replace(/\{nameComma\}/g, nameComma);
}

/* ==========================================================================
   DOM References
   ========================================================================== */

const dom = {
  starfieldCanvas: document.getElementById('starfield'),
  celebrationCanvas: document.getElementById('celebration-canvas'),
  musicToggleBtn: document.getElementById('music-toggle-btn'),
  musicLabel: document.getElementById('music-label'),
  welcomeGate: document.getElementById('welcome-gate'),
  welcomeDots: Array.from(document.querySelectorAll('.welcome-dot')),
  welcomeStepName: document.getElementById('welcome-step-name'),
  welcomeNameInput: document.getElementById('welcome-name-input'),
  welcomeSkipNameBtn: document.getElementById('welcome-skip-name-btn'),
  welcomeStepGender: document.getElementById('welcome-step-gender'),
  welcomeGenderHeading: document.getElementById('welcome-gender-heading'),
  genderChoiceBtns: Array.from(document.querySelectorAll('.gender-choice-btn')),
  welcomeBackBtn: document.getElementById('welcome-back-btn'),
  welcomeSkipGenderBtn: document.getElementById('welcome-skip-gender-btn'),
  pageShell: document.getElementById('page-shell'),
  heroTitle: document.getElementById('hero-title'),
  heroLead: document.getElementById('hero-lead'),
  tiktokCta: document.getElementById('tiktok-cta'),
  startTourBtn: document.getElementById('start-tour-btn'),
  changeProfileBtn: document.getElementById('change-profile-btn'),
  flightPathWrapper: document.getElementById('flight-path-wrapper'),
  flightTrackFill: document.getElementById('flight-track-fill'),
  flightTrackDot: document.getElementById('flight-track-dot'),
  stepItems: Array.from(document.querySelectorAll('.step-item')),
  revealItems: Array.from(document.querySelectorAll('.reveal-on-scroll')),
  checkInputs: Array.from(document.querySelectorAll('.check-input')),
  missionReady: document.getElementById('mission-ready'),
  missionReadyNote: document.getElementById('mission-ready-note'),
  cosmoDock: document.getElementById('cosmo-dock'),
  cosmoAvatarBtn: document.getElementById('cosmo-avatar-btn'),
  cosmoEyePupils: document.getElementById('cosmo-eye-pupils'),
  cosmoMinimizeBtn: document.getElementById('cosmo-minimize-btn'),
  cosmoRestoreBtn: document.getElementById('cosmo-restore-btn'),
  chipsToggleBtn: document.getElementById('chips-toggle-btn'),
  guideNameLabel: document.getElementById('guide-name-label'),
  bubbleText: document.getElementById('bubble-text'),
  bubbleLive: document.getElementById('bubble-live'),
  tourControls: document.getElementById('tour-controls'),
  tourProgressText: document.getElementById('tour-progress-text'),
  tourDots: Array.from(document.querySelectorAll('.tour-dot')),
  tourBackBtn: document.getElementById('tour-back-btn'),
  tourNextBtn: document.getElementById('tour-next-btn'),
  tourExitBtn: document.getElementById('tour-exit-btn'),
  quickReplies: document.getElementById('quick-replies'),
  replyChips: Array.from(document.querySelectorAll('.reply-chip[data-reply]')),
  askToggleBtn: document.getElementById('ask-toggle-btn'),
  askForm: document.getElementById('ask-form'),
  askInput: document.getElementById('ask-input'),
};

function applyPersonalization() {
  const { Role } = getRoleWords();
  const cleanName = appState.userName.trim();

  document.title = `Hi, ${Role}! — Secret Santa shoe guide`;
  if (dom.heroTitle) {
    dom.heroTitle.textContent = `Hi, ${Role}!`;
  }
  if (dom.heroLead) {
    dom.heroLead.textContent = cleanName
      ? `Thank you for being my Secret Santa, ${cleanName}. I’d love a pair of black leather shoes from TikTok Shop.`
      : 'Thank you for being my Secret Santa. I’d love a pair of black leather shoes from TikTok Shop.';
  }
  Checklist.syncMissionReady(false);
}

/* ==========================================================================
   4. Welcome Gate — Interactive 1st page (Name -> Gender -> Manito / Manita)
   ========================================================================== */

let updateFlightPathFn = () => {};

const WelcomeGate = {
  show(startStep = 1) {
    appState.isOnboarding = true;
    document.body.classList.add('is-onboarding');
    dom.pageShell.hidden = true;
    dom.pageShell.classList.remove('is-entered');
    dom.welcomeGate.hidden = false;
    dom.welcomeGate.classList.remove('is-leaving');
    dom.welcomeNameInput.value = appState.userName;
    this.goToStep(startStep);
    window.scrollTo({ top: 0, behavior: 'auto' });
  },

  goToStep(stepNum) {
    const isStep1 = stepNum === 1;
    dom.welcomeStepName.hidden = !isStep1;
    dom.welcomeStepGender.hidden = isStep1;

    dom.welcomeDots.forEach((dot) => {
      const n = Number(dot.dataset.welcomeDot);
      dot.classList.toggle('is-active', n === stepNum);
      dot.classList.toggle('is-done', n < stepNum);
    });

    if (isStep1) {
      window.setTimeout(() => dom.welcomeNameInput.focus(), 60);
    } else {
      const cleanName = appState.userName.trim();
      dom.welcomeGenderHeading.textContent = cleanName
        ? `Nice to meet you, ${cleanName}!`
        : 'One quick thing!';
      const firstBtn = dom.genderChoiceBtns[0];
      if (firstBtn) window.setTimeout(() => firstBtn.focus(), 60);
    }
  },

  complete(gender, isReturning = false) {
    appState.userRole = gender === 'female' ? 'manita' : 'manito';
    safeStorageSet(STORAGE_KEYS.userName, appState.userName);
    safeStorageSet(STORAGE_KEYS.userRole, appState.userRole);
    safeStorageSet(STORAGE_KEYS.onboarded, 'true');

    applyPersonalization();

    const enterMain = () => {
      appState.isOnboarding = false;
      document.body.classList.remove('is-onboarding');
      dom.welcomeGate.hidden = true;
      dom.welcomeGate.classList.remove('is-leaving');
      dom.pageShell.hidden = false;
      window.scrollTo({ top: 0, behavior: 'auto' });

      // Trigger orchestrated hero & Cosmo entrance animations.
      window.requestAnimationFrame(() => {
        dom.pageShell.classList.add('is-entered');
        updateFlightPathFn();
      });

      const savedMinimized = safeStorageGet(STORAGE_KEYS.minimized);
      Avatar.setMinimized(savedMinimized === 'true', false);
      Speech.setChipsOpen(false);

      const greetingDelay = prefersReducedMotion() ? 0 : 420;
      window.setTimeout(() => {
        Avatar.setState('wave', 1800);
        Speech.say(
          formatLine(isReturning ? DIALOGUE.introReturning : DIALOGUE.introGreeting)
        );
      }, greetingDelay);

      resetIdleTimer();
    };

    if (isReturning || prefersReducedMotion()) {
      enterMain();
    } else {
      dom.welcomeGate.classList.add('is-leaving');
      window.setTimeout(enterMain, 300);
    }
  },
};

/* ==========================================================================
   5. Avatar State Machine — Poses, tap reactions, eye tracking, minimize
   ========================================================================== */

const Avatar = {
  setState(state, revertAfterMs = 0) {
    if (!dom.cosmoAvatarBtn) return;
    window.clearTimeout(appState.poseResetTimerId);
    dom.cosmoAvatarBtn.setAttribute('data-state', state);

    if (revertAfterMs > 0) {
      appState.poseResetTimerId = window.setTimeout(() => {
        if (appState.isTourActive) {
          dom.cosmoAvatarBtn.setAttribute('data-state', 'point');
        } else {
          dom.cosmoAvatarBtn.setAttribute('data-state', 'idle');
        }
      }, revertAfterMs);
    }
  },

  triggerBoop() {
    const now = Date.now();
    if (now - appState.lastTapAt < CONFIG.tapCooldownMs) return;
    appState.lastTapAt = now;

    if (!prefersReducedMotion()) {
      dom.cosmoAvatarBtn.classList.remove('is-booped');
      void dom.cosmoAvatarBtn.offsetWidth;
      dom.cosmoAvatarBtn.classList.add('is-booped');
      window.setTimeout(() => {
        dom.cosmoAvatarBtn.classList.remove('is-booped');
      }, 540);
    }

    const line = DIALOGUE.tapReactions[appState.tapIndex % DIALOGUE.tapReactions.length];
    appState.tapIndex += 1;

    this.setState('wave', 1400);
    Speech.say(formatLine(line));
  },

  setMinimized(minimized, persist = true) {
    appState.isMinimized = Boolean(minimized);
    dom.cosmoDock.setAttribute('data-minimized', String(appState.isMinimized));
    dom.cosmoRestoreBtn.hidden = !appState.isMinimized;

    if (appState.isMinimized) {
      Speech.setChipsOpen(false);
      if (appState.isTourActive) {
        GuidedTour.exit(false);
      }
    }

    if (persist) {
      safeStorageSet(STORAGE_KEYS.minimized, String(appState.isMinimized));
    }
  },

  initEyeTracking() {
    if (!dom.cosmoEyePupils || !dom.cosmoAvatarBtn) return;
    let pointerX = 0;
    let pointerY = 0;
    let rafPending = false;

    const updateEyes = () => {
      rafPending = false;
      if (
        !finePointerQuery.matches ||
        prefersReducedMotion() ||
        appState.isMinimized ||
        appState.isOnboarding
      ) {
        dom.cosmoEyePupils.style.transform = '';
        return;
      }
      const rect = dom.cosmoAvatarBtn.getBoundingClientRect();
      if (rect.width === 0) return;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.36;
      const dx = pointerX - cx;
      const dy = pointerY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const maxOffset = 2.4;
      const scale = Math.min(1, dist / 220) * maxOffset;
      const ox = (dx / dist) * scale;
      const oy = (dy / dist) * scale;

      dom.cosmoEyePupils.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px)`;
    };

    window.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerType !== 'mouse') return;
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (!rafPending) {
          rafPending = true;
          window.requestAnimationFrame(updateEyes);
        }
      },
      { passive: true }
    );

    reducedMotionQuery.addEventListener('change', () => {
      if (prefersReducedMotion()) {
        dom.cosmoEyePupils.style.transform = '';
      }
    });
  },
};

/* ==========================================================================
   6. Speech & Typewriter — aria-live bubble, quick-reply grid, ask fallback
   ========================================================================== */

const Speech = {
  say(text) {
    window.clearInterval(appState.typewriterTimerId);
    appState.typewriterTimerId = null;

    if (dom.bubbleLive) {
      dom.bubbleLive.textContent = text;
    }

    if (prefersReducedMotion()) {
      dom.bubbleText.textContent = text;
      return;
    }

    let index = 0;
    dom.bubbleText.textContent = '';

    appState.typewriterTimerId = window.setInterval(() => {
      index += 1;
      dom.bubbleText.textContent = text.slice(0, index);
      if (index >= text.length) {
        window.clearInterval(appState.typewriterTimerId);
        appState.typewriterTimerId = null;
      }
    }, CONFIG.typewriterCharMs);
  },

  setChipsOpen(open) {
    appState.isChipsOpen = Boolean(open);
    dom.cosmoDock.setAttribute('data-chips-open', String(appState.isChipsOpen));
    dom.chipsToggleBtn.setAttribute('aria-expanded', String(appState.isChipsOpen));
    dom.chipsToggleBtn.textContent = appState.isChipsOpen ? 'Hide' : 'Questions';
    if (!appState.isChipsOpen) {
      this.toggleAskForm(false);
    }
  },

  toggleAskForm(forceState) {
    const shouldOpen =
      typeof forceState === 'boolean' ? forceState : dom.askForm.hidden;
    dom.askForm.hidden = !shouldOpen;
    dom.askToggleBtn.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen) {
      dom.askInput.focus();
    }
  },

  handleQuickReply(key) {
    this.toggleAskForm(false);
    if (window.innerWidth < 1024) {
      this.setChipsOpen(false);
    }

    if (key === 'steps') {
      GuidedTour.start(1);
      return;
    }

    const replyTemplate = DIALOGUE.quickReplies[key];
    if (!replyTemplate) {
      Avatar.setState('think', 1800);
      this.say(formatLine(CONFIG.fallbackReply));
      return;
    }

    if (key === 'where') {
      if (!(CONFIG.tiktokUrl || '').trim()) {
        Avatar.setState('think', 1800);
        this.say(formatLine(DIALOGUE.quickReplies.link));
        return;
      }
      Avatar.setState('point', 2800);
      this.say(formatLine(replyTemplate));
      highlightTikTokButton();
      return;
    }

    if (key === 'price' || key === 'link') {
      Avatar.setState('think', 1600);
    } else {
      Avatar.setState('wave', 1400);
    }
    this.say(formatLine(replyTemplate));
  },

  handleCustomQuestion(rawQuestion) {
    const q = rawQuestion.trim().toLowerCase();
    if (!q) return;

    this.toggleAskForm(false);
    dom.askInput.value = '';
    if (window.innerWidth < 1024) {
      this.setChipsOpen(false);
    }

    // Scripted local keyword matching only — no API or backend calls.
    if (/\b(size|41|fit|big|small)\b/.test(q)) {
      this.handleQuickReply('size');
      return;
    }
    if (/\b(color|colour|black|glossy|brown|style|option)\b/.test(q)) {
      this.handleQuickReply('color');
      return;
    }
    if (/\b(where|buy|shop|tiktok|store|order)\b/.test(q)) {
      this.handleQuickReply('where');
      return;
    }
    if (/\b(link|open|work|broken|search)\b/.test(q)) {
      this.handleQuickReply('link');
      return;
    }
    if (/\b(much|price|cost|peso|php|money)\b/.test(q)) {
      this.handleQuickReply('price');
      return;
    }
    if (/\b(step|steps|how|tour|guide|walk)\b/.test(q)) {
      this.handleQuickReply('steps');
      return;
    }

    // Anything outside the known facts gets CONFIG.fallbackReply.
    Avatar.setState('think', 2200);
    this.say(formatLine(CONFIG.fallbackReply));
  },
};

function highlightTikTokButton() {
  if (!dom.tiktokCta) return;

  const rect = dom.tiktokCta.getBoundingClientRect();
  const inView = rect.top >= 40 && rect.bottom <= window.innerHeight - 160;
  if (!inView) {
    dom.tiktokCta.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  }

  window.clearTimeout(appState.highlightTimerId);
  dom.tiktokCta.classList.remove('is-highlighted');
  void dom.tiktokCta.offsetWidth;
  dom.tiktokCta.classList.add('is-highlighted');

  appState.highlightTimerId = window.setTimeout(() => {
    dom.tiktokCta.classList.remove('is-highlighted');
  }, 2800);
}

/* ==========================================================================
   7. Guided Tour — 4-step interactive walkthrough
   ========================================================================== */

const GuidedTour = {
  totalSteps: 4,

  start(stepNumber = 1) {
    if (appState.isMinimized) {
      Avatar.setMinimized(false, true);
    }

    Speech.setChipsOpen(false);
    Speech.toggleAskForm(false);

    appState.isTourActive = true;
    document.body.classList.add('is-tour-active');
    dom.quickReplies.hidden = true;
    dom.chipsToggleBtn.hidden = true;
    dom.tourControls.hidden = false;

    this.goTo(stepNumber);
  },

  goTo(stepNumber) {
    const clamped = Math.max(1, Math.min(this.totalSteps, stepNumber));
    appState.tourStep = clamped;
    appState.spokenSteps.add(clamped);

    dom.stepItems.forEach((item) => {
      const isCurrent = Number(item.dataset.step) === clamped;
      item.classList.toggle('is-tour-active', isCurrent);
      if (isCurrent) {
        item.classList.add('is-visible');
      }
    });

    dom.tourProgressText.textContent = `Step ${clamped} of ${this.totalSteps}`;
    dom.tourDots.forEach((dot) => {
      const dotNum = Number(dot.dataset.dot);
      dot.classList.toggle('is-active', dotNum === clamped);
      dot.classList.toggle('is-done', dotNum < clamped);
    });

    dom.tourBackBtn.disabled = clamped === 1;
    dom.tourNextBtn.textContent = clamped === this.totalSteps ? 'Finish' : 'Next';

    const targetStep = document.getElementById(`step-${clamped}`);
    if (targetStep) {
      const topOffset = window.innerWidth < 1024 ? 14 : 44;
      const targetTop = targetStep.getBoundingClientRect().top + window.scrollY - topOffset;
      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }

    Avatar.setState('point');
    const line = DIALOGUE.tourSteps[clamped];
    if (line) {
      Speech.say(formatLine(line));
    }
  },

  next() {
    if (!appState.isTourActive) return;
    if (appState.tourStep >= this.totalSteps) {
      this.finish();
    } else {
      this.goTo(appState.tourStep + 1);
    }
  },

  back() {
    if (!appState.isTourActive || appState.tourStep <= 1) return;
    this.goTo(appState.tourStep - 1);
  },

  finish() {
    this.teardown();
    Avatar.setState('celebrate', 2200);
    Speech.say(formatLine(DIALOGUE.tourFinished));
  },

  exit(speakLine = true) {
    this.teardown();
    Avatar.setState('idle');
    if (speakLine) {
      Speech.say(formatLine(DIALOGUE.tourExited));
    }
  },

  teardown() {
    appState.isTourActive = false;
    document.body.classList.remove('is-tour-active');
    dom.stepItems.forEach((item) => item.classList.remove('is-tour-active'));
    dom.tourControls.hidden = true;
    dom.quickReplies.hidden = false;
    dom.chipsToggleBtn.hidden = false;
  },
};

/* ==========================================================================
   8. Scroll Observers & Flight Path — Reveal, scroll awareness, line draw
   ========================================================================== */

function initScrollObservers() {
  // One-shot reveal for steps and checklist section.
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    dom.revealItems.forEach((el) => el.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -30px 0px' }
    );

    dom.revealItems.forEach((el) => revealObserver.observe(el));
  }

  // First-visit scroll awareness for the 4 steps.
  if ('IntersectionObserver' in window) {
    const stepObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const stepNum = Number(entry.target.dataset.step);
          if (!stepNum || appState.spokenSteps.has(stepNum)) return;

          if (appState.isOnboarding || appState.isTourActive || appState.isMinimized) {
            return;
          }

          appState.spokenSteps.add(stepNum);
          const line = DIALOGUE.scrollSteps[stepNum];
          if (line) {
            Avatar.setState('point', 1800);
            Speech.say(formatLine(line));
          }
        });
      },
      { threshold: 0.45 }
    );

    dom.stepItems.forEach((step) => stepObserver.observe(step));
  }

  // Scroll-linked vertical flight-path line + travelling dot.
  let rafId = null;
  const updateFlightPath = () => {
    rafId = null;
    if (
      appState.isOnboarding ||
      !dom.flightPathWrapper ||
      !dom.flightTrackFill ||
      !dom.flightTrackDot
    ) {
      return;
    }

    const rect = dom.flightPathWrapper.getBoundingClientRect();
    const trackHeight = Math.max(1, rect.height - 40);
    const triggerY = window.innerHeight * 0.52;
    const rawProgress = (triggerY - rect.top) / trackHeight;
    const progress = Math.max(0, Math.min(1, rawProgress));

    dom.flightTrackFill.style.transform = `scaleY(${progress.toFixed(4)})`;
    dom.flightTrackDot.style.transform = `translateY(${(progress * trackHeight).toFixed(1)}px)`;
  };

  updateFlightPathFn = updateFlightPath;

  const requestUpdate = () => {
    if (rafId === null) {
      rafId = window.requestAnimationFrame(updateFlightPath);
    }
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  updateFlightPath();
}

/* ==========================================================================
   9. Checklist & Celebration — Persistence, reactions, star burst
   ========================================================================== */

const Checklist = {
  load() {
    let saved = {};
    const raw = safeStorageGet(STORAGE_KEYS.checklist);
    if (raw) {
      try {
        saved = JSON.parse(raw) || {};
      } catch (_) {
        saved = {};
      }
    }

    dom.checkInputs.forEach((input) => {
      const key = input.dataset.checkKey;
      if (key && saved[key] === true) {
        input.checked = true;
      }
    });

    this.syncMissionReady(false);
  },

  save() {
    const state = {};
    dom.checkInputs.forEach((input) => {
      const key = input.dataset.checkKey;
      if (key) state[key] = input.checked;
    });
    safeStorageSet(STORAGE_KEYS.checklist, JSON.stringify(state));
  },

  handleToggle(input) {
    this.save();

    if (input.checked && !prefersReducedMotion()) {
      const box = input.nextElementSibling;
      if (box) {
        box.classList.remove('is-bursting');
        void box.offsetWidth;
        box.classList.add('is-bursting');
        window.setTimeout(() => box.classList.remove('is-bursting'), 460);
      }
    }

    const checkedCount = dom.checkInputs.filter((el) => el.checked).length;
    const allChecked = checkedCount === dom.checkInputs.length;

    this.syncMissionReady(allChecked);

    if (allChecked) {
      if (appState.isMinimized) {
        Avatar.setMinimized(false, true);
      }
      Speech.setChipsOpen(false);
      Avatar.setState('celebrate', 3400);
      Speech.say(formatLine(DIALOGUE.checklistComplete));
      launchCelebrationBurst();
    } else if (input.checked && checkedCount > 0) {
      const cheer =
        DIALOGUE.checklistTicks[
          Math.min(checkedCount - 1, DIALOGUE.checklistTicks.length - 1)
        ];
      Avatar.setState('wave', 1400);
      Speech.say(formatLine(cheer));
    }
  },

  syncMissionReady(animateReveal) {
    const allChecked = dom.checkInputs.every((el) => el.checked);
    dom.missionReadyNote.textContent = formatLine(DIALOGUE.missionReadyNote);
    dom.missionReady.hidden = !allChecked;
    if (allChecked && animateReveal) {
      dom.missionReady.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
      });
    }
  },
};

function launchCelebrationBurst() {
  if (prefersReducedMotion() || !dom.celebrationCanvas) return;

  const canvas = dom.celebrationCanvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const anchorRect = dom.missionReady.getBoundingClientRect();
  const originX = anchorRect.width ? anchorRect.left + anchorRect.width / 2 : width / 2;
  const originY = anchorRect.height ? anchorRect.top + 30 : height * 0.55;

  const colors = ['#EEF1FF', '#7C8CFF', '#FFB36B'];
  const particles = Array.from({ length: 30 }, (_, idx) => {
    const angle = (Math.PI * 2 * idx) / 30 + (Math.random() - 0.5) * 0.28;
    const speed = 1.6 + Math.random() * 3.8;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      size: 2.4 + Math.random() * 2.8,
      color: colors[idx % colors.length],
      life: 0,
      maxLife: 48 + Math.random() * 22,
    };
  });

  function drawStar(x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = color;
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.4);
    ctx.quadraticCurveTo(r * 0.25, -r * 0.25, r * 1.4, 0);
    ctx.quadraticCurveTo(r * 0.25, r * 0.25, 0, r * 1.4);
    ctx.quadraticCurveTo(-r * 0.25, r * 0.25, -r * 1.4, 0);
    ctx.quadraticCurveTo(-r * 0.25, -r * 0.25, 0, -r * 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function step() {
    ctx.clearRect(0, 0, width, height);
    let alive = false;

    for (const p of particles) {
      p.life += 1;
      if (p.life >= p.maxLife) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.055;
      p.vx *= 0.985;
      const alpha = 1 - p.life / p.maxLife;
      drawStar(p.x, p.y, p.size, p.color, alpha);
    }

    if (alive) {
      window.requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }

  window.requestAnimationFrame(step);
}

/* ==========================================================================
   10. Starfield Canvas — 3 depth layers, capped count, desktop parallax
   ========================================================================== */

function initStarfield() {
  const canvas = dom.starfieldCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let stars = [];
  let rafId = null;
  let pointerTargetX = 0;
  let pointerTargetY = 0;
  let parallaxX = 0;
  let parallaxY = 0;

  const layers = [
    { ratio: 0.5, radiusMin: 0.6, radiusMax: 1.0, speed: 0.06, alpha: 0.35, parallax: 4 },
    { ratio: 0.33, radiusMin: 1.0, radiusMax: 1.45, speed: 0.13, alpha: 0.55, parallax: 9 },
    { ratio: 0.17, radiusMin: 1.45, radiusMax: 2.0, speed: 0.22, alpha: 0.8, parallax: 16 },
  ];

  function buildStars() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const totalStars = width < 768 ? 52 : 92;
    stars = [];

    layers.forEach((layer, layerIndex) => {
      const count = Math.max(8, Math.round(totalStars * layer.ratio));
      for (let i = 0; i < count; i += 1) {
        const isIonTint = layerIndex === 2 && i % 4 === 0;
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: layer.radiusMin + Math.random() * (layer.radiusMax - layer.radiusMin),
          speed: layer.speed,
          alpha: layer.alpha * (0.65 + Math.random() * 0.35),
          parallax: layer.parallax,
          color: isIonTint ? '#7C8CFF' : '#EEF1FF',
        });
      }
    });
  }

  function renderFrame(animate) {
    ctx.clearRect(0, 0, width, height);

    if (animate && finePointerQuery.matches) {
      parallaxX += (pointerTargetX - parallaxX) * 0.04;
      parallaxY += (pointerTargetY - parallaxY) * 0.04;
    } else {
      parallaxX = 0;
      parallaxY = 0;
    }

    for (const s of stars) {
      if (animate) {
        s.y -= s.speed;
        if (s.y < -4) {
          s.y = height + 4;
          s.x = Math.random() * width;
        }
      }

      const drawX = (s.x + parallaxX * s.parallax + width) % width;
      const drawY = (s.y + parallaxY * s.parallax + height) % height;

      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(drawX, drawY, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    if (document.hidden || prefersReducedMotion()) {
      rafId = null;
      return;
    }
    renderFrame(true);
    rafId = window.requestAnimationFrame(loop);
  }

  function startOrStop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (document.hidden) return;

    if (prefersReducedMotion()) {
      renderFrame(false);
    } else {
      rafId = window.requestAnimationFrame(loop);
    }
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse' || !finePointerQuery.matches) return;
      pointerTargetX = event.clientX / Math.max(1, width) - 0.5;
      pointerTargetY = event.clientY / Math.max(1, height) - 0.5;
    },
    { passive: true }
  );

  let resizeTimer = null;
  window.addEventListener(
    'resize',
    () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        buildStars();
        startOrStop();
      }, 150);
    },
    { passive: true }
  );

  document.addEventListener('visibilitychange', startOrStop);
  reducedMotionQuery.addEventListener('change', startOrStop);

  buildStars();
  startOrStop();
}

/* ==========================================================================
   11. Ambient Space Music — Built-in Web Audio celesta/pad synth or custom MP3
   ========================================================================== */

const AmbientMusic = {
  ctx: null,
  masterGain: null,
  delayNode: null,
  audioEl: null,
  schedulerId: null,
  isPlaying: false,
  isMuted: false,
  stepIndex: 0,
  nextStepTime: 0,
  unlockBound: false,

  // Gentle 76 BPM space-holiday progression (Cmaj9 -> Am9 -> Fmaj9 -> G6)
  // Frequencies in Hz for a 32-step eighth-note melody + warm pad chords.
  chords: [
    [130.81, 196.0, 246.94, 293.66], // Cmaj9 (C3, G3, B3, D4)
    [110.0, 164.81, 196.0, 246.94],  // Am9   (A2, E3, G3, B3)
    [87.31, 130.81, 164.81, 220.0],  // Fmaj7 (F2, C3, E3, A3)
    [98.0, 146.83, 196.0, 246.94],   // G6/G  (G2, D3, G3, B3)
  ],

  melody: [
    // Bar 1–2 (Cmaj9)
    659.25, 0, 783.99, 0, 1046.5, 987.77, 783.99, 0,
    659.25, 0, 587.33, 659.25, 783.99, 0, 0, 0,
    // Bar 3–4 (Am9)
    523.25, 0, 659.25, 0, 880.0, 783.99, 659.25, 0,
    523.25, 0, 587.33, 0, 523.25, 0, 0, 0,
    // Bar 5–6 (Fmaj7)
    440.0, 0, 523.25, 0, 698.46, 659.25, 523.25, 0,
    440.0, 0, 392.0, 440.0, 523.25, 0, 0, 0,
    // Bar 7–8 (G6 -> resolve)
    493.88, 0, 587.33, 0, 783.99, 698.46, 587.33, 0,
    493.88, 0, 587.33, 0, 783.99, 0, 659.25, 0,
  ],

  init() {
    if (!CONFIG.musicEnabled || !dom.musicToggleBtn) {
      if (dom.musicToggleBtn) dom.musicToggleBtn.hidden = true;
      return;
    }

    this.isMuted = safeStorageGet(STORAGE_KEYS.musicMuted) === 'true';
    this.updateUi();

    dom.musicToggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggle();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseForBackground();
      } else if (!this.isMuted && this.isPlaying) {
        this.resumeFromBackground();
      }
    });

    if (!this.isMuted) {
      // Attempt immediate autoplay on load (works where browser policy permits)
      this.tryStart(false);
      window.addEventListener('load', () => {
        if (!this.isMuted && !this.isPlaying) {
          this.tryStart(false);
        }
      }, { once: true });
      // Guarantee instant start on the very first tap/click/key anywhere on the page
      this.bindFirstGestureUnlock();
    }
  },

  bindFirstGestureUnlock() {
    if (this.unlockBound) return;
    this.unlockBound = true;

    const events = ['pointerdown', 'click', 'touchend', 'keydown'];
    const detach = () => {
      events.forEach((evt) => window.removeEventListener(evt, unlock, true));
      this.unlockBound = false;
    };

    const unlock = (event) => {
      if (event.target && dom.musicToggleBtn.contains(event.target)) return;
      if (this.isMuted) {
        detach();
        return;
      }
      this.tryStart(true, detach);
    };

    events.forEach((evt) => window.addEventListener(evt, unlock, true));
  },

  updateUi() {
    if (!dom.musicToggleBtn || !dom.musicLabel) return;
    const active = this.isPlaying && !this.isMuted;
    dom.musicToggleBtn.classList.toggle('is-playing', active);
    dom.musicToggleBtn.setAttribute('aria-pressed', String(active));
    if (this.isMuted) {
      dom.musicLabel.textContent = 'Music off';
    } else if (active) {
      dom.musicLabel.textContent = 'Music on';
    } else {
      dom.musicLabel.textContent = 'Play music';
    }
  },

  toggle() {
    if (this.isPlaying && !this.isMuted) {
      this.isMuted = true;
      safeStorageSet(STORAGE_KEYS.musicMuted, 'true');
      this.stop();
    } else {
      this.isMuted = false;
      safeStorageSet(STORAGE_KEYS.musicMuted, 'false');
      this.tryStart(true);
    }
    this.updateUi();
  },

  tryStart(fromGesture, onStarted) {
    if (this.isMuted || document.hidden) return;

    const customUrl = (CONFIG.musicUrl || '').trim();
    if (customUrl) {
      this.startCustomAudio(customUrl, onStarted);
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.setupSynthGraph(AudioCtx);
    }

    const handleRunning = () => {
      if (this.isMuted || document.hidden) return;
      this.beginSynthLoop();
      if (typeof onStarted === 'function') onStarted();
    };

    if (this.ctx.state === 'running') {
      handleRunning();
      return;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx
        .resume()
        .then(() => {
          if (this.ctx && this.ctx.state === 'running') {
            handleRunning();
          }
        })
        .catch(() => {
          // Waiting for first user gesture per browser autoplay policy.
        });
    } else if (fromGesture) {
      handleRunning();
    }
  },

  startCustomAudio(url, onStarted) {
    if (!this.audioEl) {
      this.audioEl = new Audio(url);
      this.audioEl.loop = true;
      this.audioEl.autoplay = true;
      this.audioEl.volume = CONFIG.musicVolume;
    }
    this.audioEl
      .play()
      .then(() => {
        this.isPlaying = true;
        this.updateUi();
        if (typeof onStarted === 'function') onStarted();
      })
      .catch(() => {
        this.isPlaying = false;
        this.updateUi();
      });
  },

  setupSynthGraph(AudioCtx) {
    this.ctx = new AudioCtx();
    this.ctx.onstatechange = () => {
      if (this.ctx && this.ctx.state === 'running' && !this.isMuted && !this.isPlaying && !document.hidden) {
        this.beginSynthLoop();
      }
    };

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 3.5;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0001;

    // Gentle space echo bus for the celesta notes
    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.value = 0.39;

    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.3;

    const echoFilter = this.ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 1900;

    const wetGain = this.ctx.createGain();
    wetGain.gain.value = 0.34;

    this.delayNode.connect(echoFilter);
    echoFilter.connect(feedback);
    feedback.connect(this.delayNode);
    echoFilter.connect(wetGain);
    wetGain.connect(this.masterGain);

    this.masterGain.connect(compressor);
    compressor.connect(this.ctx.destination);
  },

  beginSynthLoop() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(CONFIG.musicVolume, now + 0.35);

    if (this.schedulerId === null) {
      this.nextStepTime = now + 0.03;
      this.scheduleAhead();
      this.schedulerId = window.setInterval(() => this.scheduleAhead(), 100);
    }

    this.isPlaying = true;
    this.updateUi();
  },

  scheduleAhead() {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    const eighthDur = 60 / 76 / 2; // 76 BPM eighth-note (~0.395s)

    while (this.nextStepTime < this.ctx.currentTime + 0.35) {
      const idx = this.stepIndex % this.melody.length;

      // Trigger lush pad chord every 16 eighth-notes (2 bars)
      if (idx % 16 === 0) {
        const chordIdx = Math.floor(idx / 16) % this.chords.length;
        this.playPadChord(this.chords[chordIdx], this.nextStepTime, eighthDur * 16);
      }

      // Trigger crystalline music-box celesta note
      const freq = this.melody[idx];
      if (freq > 0) {
        this.playCelestaNote(freq, this.nextStepTime);
      }

      this.nextStepTime += eighthDur;
      this.stepIndex += 1;
    }
  },

  playCelestaNote(freq, startTime) {
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const noteGain = ctx.createGain();
    const overtoneGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, startTime);

    noteGain.gain.setValueAtTime(0.0001, startTime);
    noteGain.gain.linearRampToValueAtTime(0.36, startTime + 0.014);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.1);

    overtoneGain.gain.setValueAtTime(0.0001, startTime);
    overtoneGain.gain.linearRampToValueAtTime(0.085, startTime + 0.01);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);

    osc1.connect(filter);
    osc2.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(noteGain);

    noteGain.connect(this.masterGain);
    noteGain.connect(this.delayNode);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + 2.2);
    osc2.stop(startTime + 0.5);
  },

  playPadChord(freqs, startTime, duration) {
    const ctx = this.ctx;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(560, startTime);

    const chordGain = ctx.createGain();
    chordGain.gain.setValueAtTime(0.0001, startTime);
    chordGain.gain.linearRampToValueAtTime(0.15, startTime + 1.1);
    chordGain.gain.setValueAtTime(0.15, startTime + Math.max(1.2, duration - 1.4));
    chordGain.gain.linearRampToValueAtTime(0.0001, startTime + duration + 0.3);

    padFilter.connect(chordGain);
    chordGain.connect(this.masterGain);

    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, startTime);
      osc.detune.setValueAtTime(idx % 2 === 0 ? -4 : 4, startTime);
      osc.connect(padFilter);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.35);
    });
  },

  stop() {
    window.clearInterval(this.schedulerId);
    this.schedulerId = null;

    if (this.audioEl) {
      this.audioEl.pause();
    }

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
      window.setTimeout(() => {
        if (this.isMuted && this.ctx && this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        }
      }, 340);
    }

    this.isPlaying = false;
    this.updateUi();
  },

  pauseForBackground() {
    window.clearInterval(this.schedulerId);
    this.schedulerId = null;
    if (this.audioEl && !this.audioEl.paused) {
      this.audioEl.pause();
    }
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  },

  resumeFromBackground() {
    if (this.isMuted) return;
    if (this.audioEl) {
      this.audioEl.play().catch(() => {});
      return;
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx
        .resume()
        .then(() => {
          if (!this.isMuted && !document.hidden) {
            this.beginSynthLoop();
          }
        })
        .catch(() => {});
    }
  },
};

/* ==========================================================================
   12. Idle Nudge & Initialization
   ========================================================================== */

function resetIdleTimer() {
  window.clearTimeout(appState.idleTimerId);
  if (appState.idleNudgeCount >= CONFIG.maxIdleNudges) return;

  appState.idleTimerId = window.setTimeout(() => {
    if (
      document.hidden ||
      appState.isOnboarding ||
      appState.isTourActive ||
      appState.isMinimized ||
      appState.idleNudgeCount >= CONFIG.maxIdleNudges
    ) {
      resetIdleTimer();
      return;
    }

    const line = DIALOGUE.idleNudges[appState.idleNudgeCount];
    appState.idleNudgeCount += 1;
    if (line) {
      Avatar.setState('wave', 1500);
      Speech.say(formatLine(line));
    }

    if (appState.idleNudgeCount < CONFIG.maxIdleNudges) {
      resetIdleTimer();
    }
  }, CONFIG.idleTimeoutMs);
}

function initTikTokCta() {
  const url = (CONFIG.tiktokUrl || '').trim();
  const label = dom.tiktokCta.querySelector('.cta-label');

  if (!url) {
    dom.tiktokCta.removeAttribute('href');
    dom.tiktokCta.removeAttribute('target');
    dom.tiktokCta.setAttribute('aria-disabled', 'true');
    dom.tiktokCta.classList.add('is-disabled');
    if (label) label.textContent = 'TikTok link coming soon';
    return;
  }

  dom.tiktokCta.setAttribute('href', url);
  dom.tiktokCta.addEventListener('click', () => {
    Avatar.setState('celebrate', 1800);
    Speech.say(formatLine(DIALOGUE.tiktokTap));
  });
}

function initGuideIdentity() {
  dom.guideNameLabel.textContent = CONFIG.guideName;
  dom.cosmoAvatarBtn.setAttribute('aria-label', `Tap ${CONFIG.guideName} for a quick tip`);
  dom.cosmoMinimizeBtn.setAttribute('aria-label', `Minimize ${CONFIG.guideName}`);
  dom.cosmoRestoreBtn.setAttribute('aria-label', `Open ${CONFIG.guideName} guide`);
}

function bindEvents() {
  // Welcome gate Step 1: Name
  dom.welcomeStepName.addEventListener('submit', (event) => {
    event.preventDefault();
    appState.userName = dom.welcomeNameInput.value.trim();
    WelcomeGate.goToStep(2);
  });

  dom.welcomeSkipNameBtn.addEventListener('click', () => {
    appState.userName = '';
    WelcomeGate.goToStep(2);
  });

  // Welcome gate Step 2: Gender -> Manito / Manita
  dom.genderChoiceBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      WelcomeGate.complete(btn.dataset.gender, false);
    });
  });

  dom.welcomeBackBtn.addEventListener('click', () => {
    WelcomeGate.goToStep(1);
  });

  dom.welcomeSkipGenderBtn.addEventListener('click', () => {
    WelcomeGate.complete('male', false);
  });

  // Footer button to change name or switch Manito/Manita anytime
  dom.changeProfileBtn.addEventListener('click', () => {
    if (appState.isTourActive) {
      GuidedTour.exit(false);
    }
    WelcomeGate.show(1);
  });

  // Avatar tap (boop + cycling tips)
  dom.cosmoAvatarBtn.addEventListener('click', () => {
    Avatar.triggerBoop();
  });

  // Mobile "Questions" drawer toggle
  dom.chipsToggleBtn.addEventListener('click', () => {
    Speech.setChipsOpen(!appState.isChipsOpen);
  });

  // Minimize / restore
  dom.cosmoMinimizeBtn.addEventListener('click', () => {
    Avatar.setMinimized(true, true);
    dom.cosmoRestoreBtn.focus();
  });

  dom.cosmoRestoreBtn.addEventListener('click', () => {
    Avatar.setMinimized(false, true);
    dom.cosmoMinimizeBtn.focus();
  });

  // Quick-reply chips
  dom.replyChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      Speech.handleQuickReply(chip.dataset.reply);
    });
  });

  // Optional "Ask something else…" toggle & form
  dom.askToggleBtn.addEventListener('click', () => {
    Speech.toggleAskForm();
  });

  dom.askForm.addEventListener('submit', (event) => {
    event.preventDefault();
    Speech.handleCustomQuestion(dom.askInput.value);
  });

  // Guided tour launch & controls
  dom.startTourBtn.addEventListener('click', () => GuidedTour.start(1));
  dom.tourNextBtn.addEventListener('click', () => GuidedTour.next());
  dom.tourBackBtn.addEventListener('click', () => GuidedTour.back());
  dom.tourExitBtn.addEventListener('click', () => GuidedTour.exit(true));

  // Escape key closes guided tour, Ask input, or mobile Questions drawer
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (appState.isTourActive) {
      GuidedTour.exit(true);
    } else if (!dom.askForm.hidden) {
      Speech.toggleAskForm(false);
      dom.askToggleBtn.focus();
    } else if (appState.isChipsOpen) {
      Speech.setChipsOpen(false);
      dom.chipsToggleBtn.focus();
    }
  });

  // Checklist toggles
  dom.checkInputs.forEach((input) => {
    input.addEventListener('change', () => Checklist.handleToggle(input));
  });

  // User activity resets idle nudge timer
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, resetIdleTimer, { passive: true });
  });
}

function init() {
  initGuideIdentity();
  initTikTokCta();
  Checklist.load();
  bindEvents();
  initScrollObservers();
  Avatar.initEyeTracking();
  initStarfield();
  AmbientMusic.init();

  // Restore saved onboarding state if returning; otherwise show interactive 1st page.
  const savedName = safeStorageGet(STORAGE_KEYS.userName);
  const savedRole = safeStorageGet(STORAGE_KEYS.userRole);
  const hasOnboarded = safeStorageGet(STORAGE_KEYS.onboarded) === 'true';

  if (savedName) {
    appState.userName = savedName;
  }
  if (savedRole === 'manita' || savedRole === 'manito') {
    appState.userRole = savedRole;
  }

  if (hasOnboarded) {
    WelcomeGate.complete(appState.userRole === 'manita' ? 'female' : 'male', true);
  } else {
    WelcomeGate.show(1);
  }
}

document.addEventListener('DOMContentLoaded', init);
