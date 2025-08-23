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
    $('#name').textContent = data.profile.name;
    $('#tagline').textContent = data.profile.tagline;
    $('#avatar').src = data.profile.avatar || '/assets/images/avatar.jpg';

    // About
    $('#bio').textContent = data.profile.bio;
    const linksUl = $('#links');
    data.links.forEach((l) => {
      const a = el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, [l.label]);
      linksUl.append(el('li', {}, [a]));
    });

    // Projects
    const projects = $('#project-list');
    data.projects.forEach((p) => {
      const card = el('article', { class: 'card' }, [
        el('h3', {}, [p.title]),
        el('p', { class: 'muted' }, [p.description]),
        el('p', {}, [
          ...(p.links || []).map((l, i) => {
            const a = el('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, [l.label]);
            if (i < (p.links.length - 1)) a.append(' · ');
            return a;
          })
        ])
      ]);
      projects.append(card);
    });

    // Experience
    const expUl = $('#experience-list');
    data.experience.forEach((e) => {
      expUl.append(el('li', {}, [
        el('strong', {}, [`${e.role} — ${e.org}`]),
        el('div', { class: 'muted' }, [`${e.start} – ${e.end || '現在'}`]),
        el('div', {}, [e.summary])
      ]));
    });

    // Education
    if (Array.isArray(data.education)) {
      const eduUl = $('#education-list');
      data.education.forEach((ed) => {
        eduUl.append(el('li', {}, [
          el('strong', {}, [ed.school || '']),
          ed.note ? el('div', { class: 'muted' }, [ed.note]) : ''
        ]));
      });
    }

    // Residences
    if (Array.isArray(data.residences)) {
      const resUl = $('#residences-list');
      data.residences.forEach((r) => {
        resUl.append(el('li', {}, [
          el('strong', {}, [r.place || '']),
          r.note ? el('div', { class: 'muted' }, [r.note]) : ''
        ]));
      });
    }

    // Activities
    if (Array.isArray(data.activities)) {
      const actUl = $('#activities-list');
      data.activities.forEach((a) => {
        actUl.append(el('li', {}, [
          el('strong', {}, [a.title || '']),
          a.note ? el('div', { class: 'muted' }, [a.note]) : ''
        ]));
      });
    }

    // Skills
    const skillsUl = $('#skills-list');
    data.skills.forEach((s) => skillsUl.append(el('li', {}, [s])));

    // Contact
    const email = data.contact.email;
    $('#email').href = `mailto:${email}`;
    $('#email').textContent = email;
    $('#location').textContent = data.contact.location ? ` / ${data.contact.location}` : '';
    $('#birthday').textContent = data.contact.birthday ? ` / ${data.contact.birthday}` : '';

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
