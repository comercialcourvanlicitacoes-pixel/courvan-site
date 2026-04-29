<script>
async function loadBlog() {
  const container = document.getElementById("blog-posts");

  try {
    const res = await fetch("/content/posts");
    const text = await res.text();

    // fallback simples: lista manual via CMS JSON files
    const posts = [];

    const parser = new DOMParser();
    const html = parser.parseFromString(text, "text/html");

    const links = [...html.querySelectorAll("a")];

    for (let link of links) {
      if (link.href.endsWith(".json")) {
        const postRes = await fetch(link.href);
        const post = await postRes.json();
        posts.push(post);
      }
    }

    posts.sort((a,b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = posts.map(p => `
      <div style="background:#0c2748;padding:20px;border-radius:12px;margin-bottom:15px">
        <h3 style="color:#d8a84e">${p.title}</h3>
        <small>${new Date(p.date).toLocaleDateString()}</small>
        <p>${p.body}</p>
      </div>
    `).join("");

  } catch (err) {
    container.innerHTML = "<p>Erro ao carregar posts</p>";
  }
}

loadBlog();
</script>
