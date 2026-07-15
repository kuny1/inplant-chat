import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";

export function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <ChatArea />
    </div>
  );
}
