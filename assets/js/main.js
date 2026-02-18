(() => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const saved = localStorage.getItem('theme');
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.classList.add(theme);
})();

window.addEventListener('DOMContentLoaded', async () => {
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    }
    for (const c of children) e.append(c);
    return e;
  };

  try {
    const res = await fetch('/data/site.json', { cache: 'no-store' });
    const data = await res.json();

    // Header
    const nameEl = $('#name');
    if (nameEl) {
      const nameText = data.profile.name || '';
      const match = nameText.match(/^(.*?)\s*(\(.+\))$/);
      if (match) {
        nameEl.innerHTML = `${match[1]} <span class="name-alt">${match[2]}</span>`;
      } else {
        nameEl.textContent = nameText;
      }
    }
    $('#tagline').textContent = data.profile.tagline;
    $('#avatar').src = data.profile.avatar || '/assets/images/avatar.jpg';
    $('#avatar').alt = `${data.profile.name}のプロフィール画像`;

    // About
    const bioEl = $('#bio');
    if (bioEl) bioEl.textContent = data.profile.bio;
    const linksUl = $('#links');
    if (linksUl) {
      data.links.forEach((l) => {
        const a = el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, [l.label]);
        linksUl.append(el('li', {}, [a]));
      });
    }
    // Profile meta (location, birthday)
    const metaParts = [];
    if (data.profile.location) metaParts.push(data.profile.location);
    if (data.profile.birthday) metaParts.push(data.profile.birthday);
    const metaEl = $('#profile-meta');
    if (metaEl) metaEl.textContent = metaParts.join(' / ');

    // Metrics
    const metrics = $('#metrics');
    if (metrics) {
      const experiences = Array.isArray(data.experience) ? data.experience : [];
      const currentRole = experiences.find((exp) => !exp.end) || experiences[experiences.length - 1];
      const leadProject = data.projects?.[0];
      const skills = Array.isArray(data.skills) ? data.skills : [];
      const skillSnippet = skills.slice(0, 3).join(' / ') + (skills.length > 3 ? ' +' : '');
      const headlineActivity = data.activities?.[0];
      const cards = [
        data.profile.location
          ? { label: 'REMOTE BASE', value: data.profile.location, note: 'フルリモートで稼働' }
          : null,
        currentRole
          ? { label: 'CURRENT ROLE', value: currentRole.role, note: currentRole.org }
          : null,
        leadProject
          ? { label: 'SIGNATURE BUILD', value: leadProject.title, note: leadProject.description }
          : null,
        skills.length
          ? { label: 'CORE STACK', value: skillSnippet, note: '主要ツールの抜粋' }
          : null,
        headlineActivity
          ? {
              label: 'LATEST CHALLENGE',
              value: headlineActivity.title,
              note: headlineActivity.note || '最近取り組んだトピック'
            }
          : null
      ].filter(Boolean);

      cards.forEach((card) => {
        const children = [
          el('p', { class: 'metric-label' }, [card.label]),
          el('p', { class: 'metric-value' }, [card.value])
        ];
        if (card.note) {
          children.push(el('p', { class: 'metric-note' }, [card.note]));
        }
        metrics.append(el('article', { class: 'metric-card' }, children));
      });
    }

    // Projects
    const projects = $('#project-list');
    if (projects) {
      data.projects.forEach((p) => {
        const linksRow = el('div', { class: 'project-card-links' });
        (p.links || []).forEach((link) => {
          linksRow.append(
            el(
              'a',
              { href: link.url, target: '_blank', rel: 'noopener noreferrer' },
              [link.label]
            )
          );
        });
        const card = el('article', { class: 'project-card' }, [
          el('h3', {}, [p.title]),
          el('p', { class: 'muted' }, [p.description]),
          linksRow
        ]);
        projects.append(card);
      });
    }

    // Experience
    const expUl = $('#experience-list');
    if (expUl) {
      data.experience.forEach((e) => {
        expUl.append(el('li', {}, [
          el('strong', {}, [`${e.role} — ${e.org}`]),
          el('div', { class: 'muted' }, [`${e.start} – ${e.end || '現在'}`]),
          el('div', {}, [e.summary])
        ]));
      });
    }

    // Education
    if (Array.isArray(data.education)) {
      const eduUl = $('#education-list');
      if (eduUl) {
        data.education.forEach((ed) => {
          eduUl.append(el('li', {}, [
            el('strong', {}, [ed.school || '']),
            ed.note ? el('div', { class: 'muted' }, [ed.note]) : ''
          ]));
        });
      }
    }

    // Residences
    if (Array.isArray(data.residences)) {
      const resUl = $('#residences-list');
      if (resUl) {
        data.residences.forEach((r) => {
          resUl.append(el('li', {}, [
            el('strong', {}, [r.place || '']),
            r.note ? el('div', { class: 'muted' }, [r.note]) : ''
          ]));
        });
      }
    }

    // Activities
    if (Array.isArray(data.activities)) {
      const actUl = $('#activities-list');
      if (actUl) {
        data.activities.forEach((a) => {
          actUl.append(el('li', {}, [
            el('strong', {}, [a.title || '']),
            a.note ? el('div', { class: 'muted' }, [a.note]) : ''
          ]));
        });
      }
    }

    // Skills
    const skillsUl = $('#skills-list');
    if (skillsUl) {
      data.skills.forEach((s) => skillsUl.append(el('li', {}, [s])));
    }

    // Contact
    const email = data.contact.email;
    const emailLink = $('#email');
    if (emailLink) {
      emailLink.href = `mailto:${email}`;
      emailLink.textContent = email;
    }
    // location/birthday moved under profile and rendered in About

    // Footer
    const year = new Date().getFullYear();
    document.getElementById('copyright-year').textContent = year;
    document.getElementById('copyright-name').textContent = data.profile.name;

    // JSON-LD
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: data.profile.name,
      url: 'https://063.jp/',
      image: data.profile.avatar,
      jobTitle: data.profile.tagline,
      sameAs: data.links.map((l) => l.url)
    };
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.text = JSON.stringify(ld);
    document.head.appendChild(s);
  } catch (err) {
    console.error('Failed to load site.json', err);
  }

  // Theme toggle
  const toggle = document.getElementById('themeToggle');
  toggle?.addEventListener('click', () => {
    const root = document.documentElement;
    const cur = root.classList.contains('dark') ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    root.classList.remove(cur);
    root.classList.add(next);
    localStorage.setItem('theme', next);
  });
});
