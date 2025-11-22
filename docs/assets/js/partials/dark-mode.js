


const themeButton = {
    'light': `<i class="fas fa-adjust" aria-hidden="true"></i><span class="navbar-label-with-icon"> ${darkBtn}</span>`,
    'dark': `<i class="fas fa-adjust fa-rotate-180" aria-hidden="true"></i><span class="navbar-label-with-icon"> ${lightBtn}</span>`
};

function currentTheme(){
    return localStorage.getItem('theme');
}

function setMode(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        toggle.innerHTML = themeButton[theme];
    }
}

function themeToggle() {
    let sessionPrefers = currentTheme();
    if (sessionPrefers === 'light') {
        setMode('dark');
    } else {
        setMode('light');
    }
}

function bootstrapTheme() {
    if (isAutoTheme) {
        if (!currentTheme()) {
            let browserPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
            if (browserPrefersDark.matches) localStorage.setItem('theme', 'dark');
            browserPrefersDark.addEventListener('change', () => {
                if (browserPrefersDark.matches) localStorage.setItem('theme', 'dark');
            });
        }
        let sessionPrefers = currentTheme();
        setMode(sessionPrefers ? sessionPrefers : 'light');
    }
}

(function () {
    bootstrapTheme();
})()
