/** Escape content once at the boundary between editable data and HTML. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}

function object(value, path, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'is required');
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, 'is not a supported field');
  }
}

function string(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    fail(path, 'must not contain control characters');
  }
}

/** URL parser normalization must not turn malformed input into an accepted URL. */
export function validateUrl(value, path = 'url', { allowAssetPath = false } = {}) {
  string(value, path);
  if (/\s|[\u0000-\u001f\u007f\\]/u.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(value)) {
    fail(path, 'must not contain whitespace, control characters, or backslashes');
  }
  if (allowAssetPath && value.startsWith('/assets/')) {
    let decoded;
    try {
      decoded = decodeURIComponent(value.split(/[?#]/u, 1)[0]);
    } catch {
      fail(path, 'contains invalid URL encoding');
    }
    if (decoded.split('/').some((part) => part === '.' || part === '..') || decoded.includes('\\')) {
      fail(path, 'must stay inside /assets/');
    }
    return value;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(path, 'must be an absolute http(s) URL');
  }
  if (!/^https?:\/\//iu.test(value) || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    fail(path, 'must be an absolute http(s) URL without credentials');
  }
  return value;
}

function array(value, path, validateItem) {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  value.forEach((item, index) => validateItem(item, `${path}[${index}]`));
}

function optionalString(item, key, path) {
  if (Object.hasOwn(item, key)) string(item[key], `${path}.${key}`);
}

function optionalUrl(item, key, path) {
  if (Object.hasOwn(item, key)) validateUrl(item[key], `${path}.${key}`);
}

function date(value, path) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}(?:-(?:0[1-9]|1[0-2]))?$/u.test(value)) {
    fail(path, 'must use YYYY or YYYY-MM');
  }
}

export function validateSiteData(data) {
  object(data, 'site', ['profile', 'links', 'projects', 'experience', 'activities', 'education', 'residences', 'skills', 'contact']);
  object(data.profile, 'profile', ['name', 'displayName', 'englishName', 'handle', 'tagline', 'bio', 'avatar', 'location', 'birthday']);
  for (const key of ['name', 'displayName', 'englishName', 'handle', 'tagline', 'bio', 'location']) {
    string(data.profile[key], `profile.${key}`);
  }
  validateUrl(data.profile.avatar, 'profile.avatar', { allowAssetPath: true });
  if (!data.profile.avatar.startsWith('/assets/') && new URL(data.profile.avatar).origin !== 'https://avatars.githubusercontent.com') {
    fail('profile.avatar', 'must use /assets/ or https://avatars.githubusercontent.com to match the image security policy');
  }
  const birthday = data.profile.birthday;
  if (typeof birthday !== 'string' || !/^[1-9]\d{3}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])$/u.test(birthday)) {
    fail('profile.birthday', 'must use YYYY/MM/DD');
  }
  const normalizedBirthday = birthday.replaceAll('/', '-');
  const parsedBirthday = new Date(`${normalizedBirthday}T00:00:00Z`);
  if (Number.isNaN(parsedBirthday.valueOf()) || parsedBirthday.toISOString().slice(0, 10) !== normalizedBirthday) {
    fail('profile.birthday', 'must be a real calendar date');
  }

  function link(item, path) {
    object(item, path, ['label', 'url']);
    string(item.label, `${path}.label`);
    validateUrl(item.url, `${path}.url`);
  }
  array(data.links, 'links', link);
  array(data.projects, 'projects', (item, path) => {
    object(item, path, ['title', 'url', 'description', 'links']);
    string(item.title, `${path}.title`);
    string(item.description, `${path}.description`);
    validateUrl(item.url, `${path}.url`);
    array(item.links, `${path}.links`, link);
  });
  array(data.experience, 'experience', (item, path) => {
    object(item, path, ['role', 'org', 'start', 'end', 'summary'], ['orgUrl']);
    for (const key of ['role', 'org', 'summary']) string(item[key], `${path}.${key}`);
    optionalUrl(item, 'orgUrl', path);
    date(item.start, `${path}.start`);
    if (item.end !== null) {
      date(item.end, `${path}.end`);
      const earliestStart = `${item.start.slice(0, 4)}-${item.start.slice(5) || '01'}`;
      const latestEnd = `${item.end.slice(0, 4)}-${item.end.slice(5) || '12'}`;
      if (latestEnd < earliestStart) fail(`${path}.end`, 'must not precede start');
    }
  });
  for (const [key, title] of [['activities', 'title'], ['education', 'school'], ['residences', 'place']]) {
    array(data[key], key, (item, path) => {
      object(item, path, [title], key === 'residences' ? ['note'] : ['note', 'url']);
      string(item[title], `${path}.${title}`);
      optionalString(item, 'note', path);
      if (key !== 'residences') optionalUrl(item, 'url', path);
    });
  }
  array(data.skills, 'skills', string);
  object(data.contact, 'contact', ['email']);
  if (typeof data.contact.email !== 'string' || !/^[A-Za-z0-9.!#$&'*+/=^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/u.test(data.contact.email)) {
    fail('contact.email', 'must be a plain email address');
  }
  return data;
}

export function formatDate(value) {
  return value === null ? '現在' : value.replace('-', '.');
}

function anchor(label, url, className = '') {
  return `<a${className ? ` class="${className}"` : ''} href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function time(value) {
  return value === null ? '<span>現在</span>' : `<time datetime="${escapeHtml(value)}">${formatDate(value)}</time>`;
}

function note(value, className) {
  return value ? `<span class="${className}">${escapeHtml(value)}</span>` : '';
}

/** Render a complete document without requiring JavaScript in the browser. */
export function renderSite(template, input) {
  const data = validateSiteData(input);
  const { profile } = data;
  const values = {
    metaDescription: escapeHtml(profile.bio),
    displayName: escapeHtml(profile.displayName),
    englishName: escapeHtml(profile.englishName),
    handle: escapeHtml(profile.handle),
    avatar: escapeHtml(profile.avatar),
    ogImage: escapeHtml(new URL(profile.avatar, 'https://063.jp/').href),
    location: escapeHtml(profile.location),
    birthday: escapeHtml(profile.birthday.replaceAll('/', '.')),
    tagline: escapeHtml(profile.tagline),
    bio: escapeHtml(profile.bio),
    email: escapeHtml(data.contact.email),
    socialLinks: data.links.map(({ label, url }) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(label)}</span><span aria-hidden="true">↗</span></a></li>`).join('\n'),
    projectList: data.projects.map((project, index) => `<article class="project">
  <span class="project-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
  <div class="project-content">
    <h3 class="project-title">${anchor(project.title, project.url)}</h3>
    <p class="project-description">${escapeHtml(project.description)}</p>
    <ul class="project-links">${project.links.map(({ label, url }) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}<span aria-hidden="true">↗</span></a></li>`).join('')}</ul>
  </div>
</article>`).join('\n'),
    experienceList: data.experience.map((item) => `<li class="experience-item">
  <div class="experience-date">${time(item.start)}<span aria-hidden="true">—</span><span class="sr-only">から</span>${time(item.end)}</div>
  <div class="experience-body">
    <h3>${escapeHtml(item.role)}</h3>
    <p class="experience-org">${item.orgUrl ? anchor(item.org, item.orgUrl) : escapeHtml(item.org)}</p>
    <p class="experience-summary">${escapeHtml(item.summary)}</p>
  </div>
</li>`).join('\n'),
    activityList: data.activities.map((item) => `<li class="activity-item"><span class="activity-name">${item.url ? anchor(item.title, item.url) : escapeHtml(item.title)}</span>${note(item.note, 'activity-note')}</li>`).join('\n'),
    educationList: data.education.map((item) => `<li class="detail-item"><span class="detail-title">${item.url ? anchor(item.school, item.url) : escapeHtml(item.school)}</span>${note(item.note, 'detail-note')}</li>`).join('\n'),
    residenceList: data.residences.map((item) => `<li class="place-item"><span class="place-name">${escapeHtml(item.place)}</span>${note(item.note, 'place-note')}</li>`).join('\n'),
    skillList: data.skills.map((skill) => `<li class="skill">${escapeHtml(skill)}</li>`).join('\n'),
  };
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/gu, (_, token) => {
    if (!Object.hasOwn(values, token)) throw new Error(`Unknown template token: ${token}`);
    return values[token];
  });
}
