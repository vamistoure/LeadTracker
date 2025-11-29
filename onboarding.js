(() => {
  const qs = (sel) => document.querySelector(sel);

  function setStatus(message, type = 'info') {
    const box = qs('#authStatus');
    if (!box) return;
    if (!message) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden', 'info', 'error', 'success');
    box.classList.add(type);
    box.textContent = message;
  }

  function toggleTab(tabId) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((t) => t.classList.remove('active'));
    const activeTab = qs(`.tab[data-tab="${tabId}"]`);
    if (activeTab) activeTab.classList.add('active');

    const forms = [
      ['signin', '#formSignin'],
      ['signup', '#formSignup']
    ];
    forms.forEach(([id, sel]) => {
      const form = qs(sel);
      if (form) form.classList.toggle('hidden', id !== tabId);
    });

    // Focus premier champ du formulaire actif
    const firstInput =
      tabId === 'signin' ? qs('#signinEmail') : tabId === 'signup' ? qs('#signupEmail') : null;
    if (firstInput) firstInput.focus();
    setStatus('', 'info');
  }

  const steps = ['welcome', 'mode', 'auth', 'activate', 'first'];
  let currentStepIndex = 0;

  function renderStep() {
    const currentStep = steps[currentStepIndex];
    document.querySelectorAll('.step-card').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.step !== currentStep);
    });
    const progressText = qs('#progressText');
    if (progressText) {
      progressText.textContent = `Étape ${currentStepIndex + 1} sur ${steps.length}`;
    }
    const progressFill = qs('#progressFill');
    if (progressFill) {
      const pct = ((currentStepIndex + 1) / steps.length) * 100;
      progressFill.style.width = `${pct}%`;
    }
  }

  function goToStep(stepId) {
    const idx = steps.indexOf(stepId);
    if (idx === -1) return;
    currentStepIndex = idx;
    renderStep();
  }

  async function handleAuth({ mode }) {
    const emailInput = qs(mode === 'signin' ? '#signinEmail' : '#signupEmail');
    const passwordInput = qs(mode === 'signin' ? '#signinPassword' : '#signupPassword');
    const btn = qs(mode === 'signin' ? '#btnSignin' : '#btnSignup');
    const textSpan = qs(mode === 'signin' ? '#btnSigninText' : '#btnSignupText');
    const loader = qs(mode === 'signin' ? '#btnSigninLoader' : '#btnSignupLoader');

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;
    if (!email || !password) {
      setStatus('Email et mot de passe requis.', 'error');
      return;
    }
    if (!window?.supabaseSync) {
      setStatus('Supabase indisponible.', 'error');
      return;
    }

    btn.disabled = true;
    if (textSpan) textSpan.style.opacity = '0.6';
    if (loader) loader.classList.remove('hidden');
    setStatus('Veuillez patienter...', 'info');

    try {
      const res =
        mode === 'signin'
          ? await window.supabaseSync.signInWithPassword(email, password)
          : await window.supabaseSync.signUpWithPassword(email, password);

      const accessToken =
        res?.access_token ||
        res?.session?.access_token ||
        (res?.data && res.data.session ? res.data.session.access_token : null);

      if (!accessToken) {
        // Signup peut nécessiter confirmation email => pas de token
        const needsConfirm = !!res?.user && !res?.access_token;
        setStatus(
          needsConfirm
            ? 'Compte créé. Vérifie ton email pour confirmer, puis reconnecte-toi.'
            : 'Connexion/inscription échouée. Vérifie tes identifiants.',
          'error'
        );
        return;
      }

      await chrome.storage.local.set({
        supabaseAccessToken: accessToken,
        supabaseUser: { email },
        supabaseMode: 'cloud',
        supabaseLastSync: null
      });
      setStatus(mode === 'signin' ? 'Connecté.' : 'Compte créé et connecté.', 'success');
      setTimeout(() => {
        window.location.href = chrome.runtime.getURL('options.html');
      }, 600);
    } catch (e) {
      console.error('Auth failed:', e);
      setStatus('Échec de la connexion/inscription. Vérifiez vos identifiants.', 'error');
    } finally {
      btn.disabled = false;
      if (textSpan) textSpan.style.opacity = '1';
      if (loader) loader.classList.add('hidden');
      if (passwordInput) passwordInput.value = '';
    }
  }

  async function checkSessionAndBypass() {
    try {
      const data = await chrome.storage.local.get([
        'supabaseAccessToken',
        'supabaseUser',
        'supabaseMode'
      ]);
      if (data?.supabaseAccessToken || data?.supabaseMode === 'local') {
        // déjà configuré (cloud ou local), rediriger vers dashboard
        window.location.href = chrome.runtime.getURL('options.html');
      }
    } catch (e) {
      console.warn('Session check failed:', e);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    checkSessionAndBypass();
    renderStep();

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => toggleTab(tab.dataset.tab));
    });

    const btnSignin = qs('#btnSignin');
    if (btnSignin) btnSignin.addEventListener('click', () => handleAuth({ mode: 'signin' }));
    const btnSignup = qs('#btnSignup');
    if (btnSignup) btnSignup.addEventListener('click', () => handleAuth({ mode: 'signup' }));

    const btnStart = qs('#btnStart');
    if (btnStart) btnStart.addEventListener('click', () => goToStep('mode'));

    const btnPickCloud = qs('#btnPickCloud');
    if (btnPickCloud) btnPickCloud.addEventListener('click', () => goToStep('auth'));
    const btnPickLocal = qs('#btnPickLocal');
    if (btnPickLocal) {
      btnPickLocal.addEventListener('click', () => {
        setStatus('Mode local activé. Vous pourrez vous connecter plus tard.', 'info');
        chrome.storage.local.remove(['supabaseAccessToken', 'supabaseUser']);
        chrome.storage.local.set({ supabaseMode: 'local' }, () => {
          goToStep('activate');
        });
      });
    }

    const btnOpenLinkedin = qs('#btnOpenLinkedin');
    if (btnOpenLinkedin) {
      btnOpenLinkedin.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.linkedin.com' });
        goToStep('first');
      });
    }

    const btnDone = qs('#btnDone');
    if (btnDone) {
      btnDone.addEventListener('click', () => {
        const skip = qs('#skipOnboarding')?.checked;
        const payload = skip ? { onboardingHidden: true } : {};
        chrome.storage.local.set(payload, () => {
          window.location.href = chrome.runtime.getURL('options.html');
        });
      });
    }

    const btnStayLinkedin = qs('#btnStayLinkedin');
    if (btnStayLinkedin) {
      btnStayLinkedin.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.linkedin.com' });
      });
    }

    const btnContinueLocal = qs('#btnContinueLocal');
    if (btnContinueLocal) {
      btnContinueLocal.addEventListener('click', () => {
        setStatus('Mode local activé. Vous pouvez vous connecter plus tard.', 'info');
        chrome.storage.local.remove(['supabaseAccessToken', 'supabaseUser']);
        chrome.storage.local.set({ supabaseMode: 'local' }, () => {
          goToStep('activate');
        });
      });
    }

    const btnOpenDashboard = qs('#btnOpenDashboard');
    if (btnOpenDashboard) {
      btnOpenDashboard.addEventListener('click', () => {
        window.location.href = chrome.runtime.getURL('options.html');
      });
    }
  });
})();
