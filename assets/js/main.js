(() => {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const saved = localStorage.getItem("theme");
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.classList.add(theme);
})();

window.addEventListener("DOMContentLoaded", async () => {
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "class") node.className = value;
      else node.setAttribute(key, value);
    });
    children.forEach((child) => node.append(child));
    return node;
  };
  const clear = (node) => node && node.replaceChildren();
  const externalLink = (url, text, className = "linked-text") =>
    el(
      "a",
      { href: url, target: "_blank", rel: "noopener noreferrer", class: className },
      [text]
    );

  const renderName = (node, text = "") => {
    if (!node) return;
    clear(node);
    const match = text.match(/^(.*?)\s*(\(.+\))$/);
    if (!match) {
      node.textContent = text;
      return;
    }
    node.append(document.createTextNode(match[1].trim()));
    node.append(el("span", { class: "name-sub" }, [match[2]]));
  };

  const renderMeta = (node, values = []) => {
    if (!node) return;
    clear(node);
    values
      .filter(Boolean)
      .forEach((value) => node.append(el("span", { class: "meta-chip" }, [value])));
  };

  const renderLinks = (node, links = []) => {
    if (!node) return;
    clear(node);
    links.forEach((link) => {
      const anchor = el(
        "a",
        { href: link.url, target: "_blank", rel: "noopener noreferrer" },
        [link.label]
      );
      node.append(el("li", {}, [anchor]));
    });
  };

  const renderHighlights = (node, data) => {
    if (!node) return;
    clear(node);
    const experiences = Array.isArray(data.experience) ? data.experience : [];
    const currentRole = experiences.find((item) => !item.end) || experiences[experiences.length - 1];
    const recentActivity = Array.isArray(data.activities) ? data.activities[0] : null;
    const skills = Array.isArray(data.skills) ? data.skills : [];
    const highlightItems = [
      currentRole
        ? {
            label: "Current role",
            value: currentRole.role,
            note: currentRole.org
          }
        : null,
      recentActivity
        ? {
            label: "Recent topic",
            value: recentActivity.title,
            note: recentActivity.note || "最近のトピック"
          }
        : null,
      skills.length
        ? {
            label: "Usual tools",
            value: skills.slice(0, 4).join(" / "),
            note: "よく触るもの"
          }
        : null
    ].filter(Boolean);

    highlightItems.forEach((item) => {
      node.append(
        el("article", { class: "highlight-card" }, [
          el("p", { class: "highlight-label" }, [item.label]),
          el("p", { class: "highlight-value" }, [item.value]),
          el("p", { class: "highlight-note" }, [item.note])
        ])
      );
    });
  };

  const renderTicker = (node, data) => {
    if (!node) return;
    clear(node);
    const skills = Array.isArray(data.skills) ? data.skills : [];
    const activities = Array.isArray(data.activities) ? data.activities.slice(0, 4).map((item) => item.title) : [];
    const items = [...skills, ...activities];
    const repeated = [...items, ...items, ...items];
    repeated.forEach((item) => {
      node.append(el("span", { class: "ticker-item" }, [item]));
    });
  };

  const renderProjects = (node, projects = []) => {
    if (!node) return;
    clear(node);
    const projectPalettes = [
      ["rgba(216, 92, 43, 0.22)", "rgba(14, 93, 100, 0.14)"],
      ["rgba(14, 93, 100, 0.2)", "rgba(216, 92, 43, 0.12)"],
      ["rgba(232, 129, 43, 0.18)", "rgba(47, 124, 132, 0.14)"],
      ["rgba(173, 95, 58, 0.18)", "rgba(18, 92, 96, 0.12)"]
    ];
    projects.forEach((project, index) => {
      const [glowA, glowB] = projectPalettes[index % projectPalettes.length];
      const links = el("div", { class: "project-card-links" });
      (project.links || []).forEach((link) => {
        links.append(
          el(
            "a",
            { href: link.url, target: "_blank", rel: "noopener noreferrer" },
            [link.label]
          )
        );
      });
      node.append(
        el(
          "article",
          {
            class: "project-card",
            style: `--project-glow-a: ${glowA}; --project-glow-b: ${glowB};`
          },
          [
          el("p", { class: "project-index" }, [`Project ${String(index + 1).padStart(2, "0")}`]),
          el("h3", {}, [
            project.url || project.links?.[0]?.url
              ? externalLink(project.url || project.links[0].url, project.title, "project-title-link")
              : project.title
          ]),
          el("p", { class: "muted" }, [project.description]),
          links
          ]
        )
      );
    });
  };

  const renderExperience = (node, items = []) => {
    if (!node) return;
    clear(node);
    items.forEach((item) => {
      node.append(
        el("li", {}, [
          el("div", { class: "career-period" }, [`${item.start} - ${item.end || "現在"}`]),
          el("div", { class: "career-body" }, [
            el("strong", { class: "career-role" }, [item.role]),
            el("div", { class: "career-org" }, [
              item.orgUrl ? externalLink(item.orgUrl, item.org) : item.org
            ]),
            el("div", { class: "career-summary" }, [item.summary])
          ])
        ])
      );
    });
  };

  const renderSimpleList = (node, items = [], titleKey, noteKey) => {
    if (!node) return;
    clear(node);
    items.forEach((item) => {
      const title = item[titleKey] || "";
      const children = [
        el("strong", {}, [item.url ? externalLink(item.url, title) : title])
      ];
      if (item[noteKey]) {
        children.push(el("div", { class: "muted" }, [item[noteKey]]));
      }
      node.append(el("li", {}, children));
    });
  };

  try {
    const res = await fetch("/data/site.json", { cache: "no-store" });
    const data = await res.json();

    renderName($("#name"), data.profile.name || "");
    const taglineEl = $("#tagline");
    if (taglineEl) taglineEl.textContent = data.profile.tagline || "";
    const bioEl = $("#bio");
    if (bioEl) bioEl.textContent = data.profile.bio || "";

    const avatarEl = $("#avatar");
    if (avatarEl) {
      avatarEl.src = data.profile.avatar || "/assets/images/avatar.jpg";
      avatarEl.alt = `${data.profile.name}のプロフィール画像`;
    }

    renderMeta($("#profile-meta"), [
      data.profile.location ? `${data.profile.location}在住` : "",
      data.profile.birthday ? `${data.profile.birthday} 生まれ` : ""
    ]);

    const profileKicker = $("#profile-kicker");
    if (profileKicker) {
      profileKicker.textContent = data.profile.location
        ? `${data.profile.location} / Remote`
        : "Based in Japan";
    }

    const profileCaption = $("#profile-caption");
    if (profileCaption) {
      const caption = Array.isArray(data.skills) ? data.skills.slice(0, 4).join(" / ") : "";
      profileCaption.textContent = caption || data.profile.tagline || "";
    }

    renderLinks($("#links"), data.links || []);
    renderHighlights($("#highlight-list"), data);
    renderTicker($("#skill-marquee"), data);
    renderProjects($("#project-list"), data.projects || []);
    renderExperience($("#experience-list"), data.experience || []);
    renderSimpleList($("#activities-list"), data.activities || [], "title", "note");
    renderSimpleList($("#education-list"), data.education || [], "school", "note");
    renderSimpleList($("#residences-list"), data.residences || [], "place", "note");

    const skillsEl = $("#skills-list");
    if (skillsEl) {
      clear(skillsEl);
      (data.skills || []).forEach((skill) => skillsEl.append(el("li", {}, [skill])));
    }

    const emailEl = $("#email");
    if (emailEl) {
      emailEl.href = `mailto:${data.contact.email}`;
      emailEl.textContent = data.contact.email;
    }

    const yearEl = $("#copyright-year");
    if (yearEl) yearEl.textContent = `${new Date().getFullYear()}`;
    const copyrightName = $("#copyright-name");
    if (copyrightName) copyrightName.textContent = data.profile.name;

    const ld = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: data.profile.name,
      url: "https://063.jp/",
      image: data.profile.avatar,
      jobTitle: data.profile.tagline,
      sameAs: (data.links || []).map((item) => item.url)
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(ld);
    document.head.appendChild(script);
  } catch (err) {
    console.error("Failed to load site.json", err);
  }

  const toggle = $("#themeToggle");
  toggle?.addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.classList.contains("dark") ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    root.classList.remove(current);
    root.classList.add(next);
    localStorage.setItem("theme", next);
  });
});
