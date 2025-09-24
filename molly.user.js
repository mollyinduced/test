// ==UserScript==
// @name         mollyminions
// @namespace    minion companion for gota.io
// @version      1.0.0
// @description  if your alone or in a private server
// @author       mollyinduced
// @match        *://gota.io/web/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // cloudflare tunnel domain
  const serverbots = "wss://bots.mdma.rip";

  // simple reader for bytecode
  class Reader {
    constructor(buffer){ this.dataView = new DataView(buffer); this.byteOffset = 0; }
    readUint8(){ return this.dataView.getUint8(this.byteOffset++); }
    readUint16(){ const v = this.dataView.getUint16(this.byteOffset, true); this.byteOffset += 2; return v; }
    readInt32(){ const v = this.dataView.getInt32(this.byteOffset, true); this.byteOffset += 4; return v; }
    readString(){
      let s = "", c;
      while ((c = this.readUint8()) !== 0) s += String.fromCharCode(c);
      return s;
    }
  }
  // simple write for the bytecode
  class Writer {
    constructor(size){ this.dataView = new DataView(new ArrayBuffer(size)); this.byteOffset = 0; }
    writeUint8(v){ this.dataView.setUint8(this.byteOffset++, v); }
    writeInt32(v){ this.dataView.setInt32(this.byteOffset, v, true); this.byteOffset += 4; }
    writeString(str){ for (let i=0;i<str.length;i++) this.writeUint8(str.charCodeAt(i)); this.writeUint8(0); }
  }


  // main class for extension
class MOLLYINDUCED {
    constructor(){
      this.ws = null;
      this.config = { server: null, startedminions: false };
      this._init();
    }

    _init(){
      this._injectRoot();
      this._injectStyles();
      this._injectUI();
      this._hookGameWS();
      this._connect();
    }

    _connect(){
      this.ws = new WebSocket(serverbots);
      this.ws.binaryType = "arraybuffer";
      this.ws.onopen = this.onopen.bind(this);
      this.ws.onclose = (e) => { console.warn('MMinions client close', e); this.onclose(e); };
      this.ws.onerror = (e) => { console.error('MMinions client error', e); };
      this.ws.onmessage = this.onmessage.bind(this);
    }

    send(buf){ if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(buf); }

    onopen(){
      const gp = document.getElementById("getProxies");
      const bc = document.getElementById("minionCount");
      const st = document.getElementById("Status");
      if (gp) gp.disabled = false;
      if (bc) { bc.innerText = `Ready`; bc.style.color = `rgb(40, 199, 111)`; }
      if (st) { st.innerText = "Connected"; st.style.color = "rgb(40, 199, 111)"; }
      if (gp) gp.innerText = "Refresh";
    }

    onclose(){
      this.config.startedminions = false;
      const sb = document.getElementById("startMinions");
      const gp = document.getElementById("getProxies");
      const sp = document.getElementById("stopMinions");
      const st = document.getElementById("Status");
      const bc = document.getElementById("minionCount");
      if (sb) sb.disabled = false;
      if (gp) gp.disabled = false;
      if (sp) sp.style.display = "none";
      if (sb) sb.style.display = "block";
      if (st) st.style.color = "#fff";
      if (bc) { bc.style.color = "#fff"; bc.innerText = `Offline`; }
      if (st) st.innerText = "Connecting";
      if (gp) gp.innerText = "Refresh";
      this._connect();
    }

    onmessage(evt){
      const r = new Reader(evt.data);
      const op = r.readUint8();
      switch (op){
        case 0: this.config.startedminions = true; break;
        case 1:
          this.config.startedminions = false;
          const sb = document.getElementById("startMinions");
          const gp = document.getElementById("getProxies");
          const bc = document.getElementById("minionCount");
          const sp = document.getElementById("stopMinions");
          if (sb) sb.disabled = false;
          if (gp) gp.disabled = false;
          if (bc) { bc.innerText = `Stopped`; bc.style.color = `#ea5455`; }
          if (sp) sp.style.display = "none";
          if (sb) sb.style.display = "inline";
          break;
        case 2:
          const spawned = r.readUint16();
          const total = r.readUint16();
          const el = document.getElementById("minionCount");
          if (el){ el.innerText = `${spawned}/${total}`; el.style.color = (spawned === total) ? `rgb(40, 199, 111)` : `#fff`; }
          break;
        case 3:
          this.requestCaptchaToken(r);
          break;
        case 4:
          const btn = document.getElementById("getProxies");
          if (!btn) break;
          btn.disabled = false;
          btn.innerText = "Success";
          btn.style.color = "rgb(40, 199, 111)";
          setTimeout(() => { btn.style.color = "#fff"; btn.innerText = "Refresh"; }, 2000);
          break;
      }
    }

    sendServer(){
      if (!this.config.server) return;
      const w = new Writer(3 + this.config.server.length);
      w.writeUint8(0);
      w.writeString(this.config.server);
      this.send(w.dataView.buffer);
    }

    startMinions(){
      if (!this.config.startedminions && this.config.server){
        this.sendServer();
        this.send(new Uint8Array([1]).buffer);
        const sb = document.getElementById("startMinions");
        const gp = document.getElementById("getProxies");
        const sp = document.getElementById("stopMinions");
        if (sb) sb.disabled = true;
        if (gp) gp.disabled = true;
        if (sb) sb.style.display = "none";
        if (sp) sp.style.display = "block";
      }
    }
    stopMinions(){ this.send(new Uint8Array([2]).buffer); }
    splitMinions(){ if (this.config.startedminions) this.send(new Uint8Array([3]).buffer); }
    ejectMinions(){ if (this.config.startedminions) this.send(new Uint8Array([4]).buffer); }
    sendMouse(x,y){
      const w = new Writer(13);
      w.writeUint8(5); w.writeInt32(x); w.writeInt32(y);
      this.send(w.dataView.buffer);
    }
    getProxies(){
      if (!this.config.startedminions){
        this.send(new Uint8Array([7]).buffer);
        const gp = document.getElementById("getProxies");
        if (gp) gp.disabled = true;
      }
    }

    _hookGameWS(){
      const self = this;
      const nativeSend = window.WebSocket.prototype.send;
      const parseMouse = (dv) => ({ x: dv.getInt32(1, true), y: dv.getInt32(5, true) });
      window.WebSocket.prototype.send = function(d){
        nativeSend.apply(this, arguments);
        if (typeof d === 'string' || !(d instanceof ArrayBuffer || d?.buffer instanceof ArrayBuffer)) return;
        if (this.url.includes(serverbots)) return;
        try {
          const dv = new DataView(new Uint8Array(d).buffer);
          const op = dv.getUint8(0);
          if (op === 16){
            const { x, y } = parseMouse(dv);
            self.sendMouse(x, y);
            if (self.config.server !== this.url) self.config.server = this.url;
          }
        } catch (e){ /* ignore */ }
      };
    }

    _injectRoot(){
      const el = document.createElement("div");
      el.id = "_9yryhcrukp";
      el.style.zIndex = "9999";
      (document.body || document.documentElement).appendChild(el);
    }

    _injectStyles(){
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap";
      document.head.appendChild(link);
      const style = document.createElement("style");
      style.textContent = `
      *{font-family:Inter;margin:0;padding:0}
      #nf-wrapper{top:0;left:50%;padding:8px;z-index:9999;position:fixed;box-shadow:var(--shadow);transform:translateX(-50%);background-color:rgba(22,22,22,.8);border-bottom:3px solid transparent;border-image:linear-gradient(to right,#E667CA,#5EAEFF,#F67373,#FBB500) 1;border-image-slice:1}
      .nf-body{gap:10px;display:flex;min-width:400px;align-items:center;justify-content:space-around}
      .nf-logo h2{font-size:23px;letter-spacing:-1px;font-weight:700}
      .nf-logo a{font-size:14px;text-decoration:none;color:#fff}
      .nf-item{color:#fff;display:flex;font-size:14px;flex-direction:column;align-items:center;min-width:50px}
      .nf-button{border:none;cursor:pointer;background:transparent;margin-top:.125rem;color:#fff}
      .nf-button:disabled{opacity:.5;cursor:not-allowed}
      #stopMinions{color:#f67373}
      `;
      document.head.appendChild(style);
    }

    _injectUI(){
      const root = document.getElementById("_9yryhcrukp");
      if (!root) return;
      root.insertAdjacentHTML("beforeend", `
      <div id="nf-wrapper">
        <div class="nf-body">
          <div class="nf-logo">
            <h2><span style="color:#e667ca">M</span><span style="color:#5eaeff">O</span><span style="color:#f67373">L</span><span style="color:#fbb500">L</span><span style="color:#e667ca">Y</span><span style="color:#5eaeff">B</span><span style="color:#e667ca">O</span><span style="color:#5eaeff">T</span><span style="color:#e667ca">S</span></h2>
            <a href="https://youtube.com/@NelFeast" target="_blank" rel="noopener noreferrer">Best player helper</a>
          </div>
          <div class="nf-item"><h4>Status</h4><span id="Status">Connecting</span></div>
          <div class="nf-item"><h4>Minions</h4><span id="minionCount">0/0</span></div>
          <div class="nf-item"><h4>Proxies</h4><button type="button" class="nf-button" id="getProxies">Refresh</button></div>
          <div class="nf-item"><h4>Action</h4><button type="button" class="nf-button" id="startMinions">Start</button><button type="button" class="nf-button" id="stopMinions" style="display:none">Stop</button></div>
        </div>
      </div>`);
      root.addEventListener("click", (e) => {
        const id = e.target?.id;
        if (id === "getProxies") this.getProxies();
        if (id === "startMinions") this.startMinions();
        if (id === "stopMinions")  this.stopMinions();
      });
      document.addEventListener("keydown", (e) => {
        if (e.keyCode === 69) this.splitMinions();
        if (e.keyCode === 82) this.ejectMinions();
      });
    }
  }

  window.server = new MOLLYINDUCED();
})();
