import React from "react";

// Catches any uncaught error in the app's render tree so a single bug can't blank the
// whole page to white. Shows a calm recovery screen with a reload button instead.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: (error && error.message) || "Something went wrong." };
  }

  componentDidCatch(error, info) {
    // Best-effort log. No external service required; visible in the browser console for now.
    try {
      console.error("Spine app error:", error, info && info.componentStack);
    } catch (e) {}
  }

  handleReload = () => {
    try { window.location.reload(); } catch (e) {}
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#F7F4EF", color: "#2b2722", fontFamily: "'Inter', system-ui, sans-serif", padding: 24
        }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <div style={{ width: 3, height: 34, background: "#b8893b", borderRadius: 2, margin: "0 auto 20px" }} />
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 10px" }}>The Spine hit a snag</h1>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: "#6b645b", margin: "0 0 22px" }}>
              Something interrupted the page, but your work and account are safe. Reload to pick
              up where you left off.
            </p>
            <button onClick={this.handleReload} style={{
              border: "none", background: "#2b2722", color: "#fff", fontSize: 15, fontWeight: 500,
              padding: "12px 22px", borderRadius: 9, cursor: "pointer"
            }}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
