export default function ThemeInit() {
  const script = `
    (function () {
      try {
        var pref = window.localStorage.getItem("curio:theme");
        if (pref === "light" || pref === "dark") {
          document.documentElement.setAttribute("data-theme", pref);
        }
      } catch (e) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
