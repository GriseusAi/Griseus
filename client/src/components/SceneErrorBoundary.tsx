import { Component, type ReactNode } from "react";

/**
 * Strategy Canvas sahnesi için hata sınırı — render sırasında bir component
 * exception atarsa beyaz ekran yerine kullanıcıya net mesaj + reset butonu
 * gösterir. localStorage'daki bozuk sahne state'i (pozisyon, silinen atom,
 * shape override, custom edge) sıfırlanabilir.
 */

interface Props { children: ReactNode }
interface State { error: Error | null }

const STORAGE_KEYS = [
  "griseus_strategy_pos",
  "griseus_strategy_orders_v1",
  "griseus_strategy_positions_v3",
  "griseus_strategy_viewport_v2",
  "griseus_strategy_expanded_v1",
  "griseus_strategy_subs_v1",
  "griseus_customers_expanded_v1",
  "griseus_customers_panel_open_v1",
  "griseus_customers_panel_pos_v1",
  "griseus_scene_pos_v1",
  "griseus_scene_deleted_v1",
  "griseus_scene_shapes_v1",
  "griseus_scene_custom_edges_v1",
  "griseus_scene_edge_commands_v1",
  "griseus_scene_atom_meta_v1",
  "griseus_scene_custom_atoms_v1",
  "griseus_categories_pos_v1",
  "griseus_products_pos_v1",
  "griseus_stages_pos_v1",
  "griseus_factory_pos_v1",
  "griseus_supply_pos_v1",
  "griseus_supply_entries_v1",
];

export default class SceneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[SceneErrorBoundary] render hatası:", error, info);
  }

  resetState = () => {
    try {
      STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    } catch { /* noop */ }
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        padding: 32, fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#faf8f3", color: "#1c1917", minHeight: "60vh",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 16, textAlign: "center",
      }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#a8a29e", fontWeight: 600 }}>
          ◇ STRATEJİ CANVAS HATA
        </div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          Sahne render edilirken bir hata oluştu
        </div>
        <pre style={{
          maxWidth: 720, padding: 16, fontSize: 12, lineHeight: 1.5,
          background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 8, overflow: "auto", whiteSpace: "pre-wrap",
        }}>
          {String(this.state.error?.stack ?? this.state.error?.message ?? this.state.error)}
        </pre>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={this.retry} style={{
            padding: "8px 16px", borderRadius: 8,
            background: "transparent", border: "1px solid rgba(0,0,0,0.2)",
            color: "#1c1917", cursor: "pointer", fontSize: 13,
          }}>
            Yeniden dene
          </button>
          <button onClick={this.resetState} style={{
            padding: "8px 16px", borderRadius: 8,
            background: "#dc2626", border: "1px solid #dc2626",
            color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>
            Sahne state'ini sıfırla & yeniden yükle
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#78716c", maxWidth: 540 }}>
          "Sıfırla" tüm sahne pozisyonlarını, silinen atom listesini, custom
          edge'leri ve şekil override'larını localStorage'dan temizler.
          Senaryo kayıtlarına dokunmaz.
        </div>
      </div>
    );
  }
}
