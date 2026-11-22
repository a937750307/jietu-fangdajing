(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const DEFAULTS = {
    size:50, zoom:1.2, blur:10, tint:'#0f172a', tintOpacity:22,
    borderColor:'#ffffff', borderWidth:10, shape:'circle'
  };
  const state = Object.assign({}, DEFAULTS);
  let img = null, imgUrl = null, lx = 0.5, ly = 0.5, dragging = false;

  const base = document.createElement('canvas');
  const finalCv = document.createElement('canvas');
  const view = $('canvas');
  const stage = $('stage');
  let toastTimer = null;

  function toast(msg){
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function hexToRgba(hex, alpha){
    const h = hex.replace('#','');
    const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + alpha + ')';
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ---------- rendering ---------- */
  function rebuildBase(){
    if(!img) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    base.width = w; base.height = h;
    const c = base.getContext('2d');
    c.clearRect(0,0,w,h);
    c.drawImage(img,0,0,w,h);
    const scale = w / 1200;
    const blurPx = state.blur * scale;
    if(blurPx > 0.2){
      c.save();
      c.filter = 'blur(' + blurPx + 'px)';
      const e = blurPx * 3;
      c.drawImage(img, -e, -e, w + 2*e, h + 2*e);
      c.restore();
    }
    if(state.tintOpacity > 0){
      c.fillStyle = hexToRgba(state.tint, state.tintOpacity / 100);
      c.fillRect(0,0,w,h);
    }
  }

  function lensDims(r, w, h){
    let hw = r, hh = r;
    if(state.shape === 'hbar'){
      hw = r*1.7; hh = r*0.62;
      const lim = w*0.49;
      if(hw > lim){ const k = lim/hw; hw *= k; hh *= k; }
    } else if(state.shape === 'vbar'){
      hw = r*0.62; hh = r*1.7;
      const lim = h*0.49;
      if(hh > lim){ const k = lim/hh; hw *= k; hh *= k; }
    }
    return { hw: hw, hh: hh };
  }

  function lensPath(c, cx, cy, hw, hh, inset){
    inset = inset || 0;
    const w = Math.max(1, (hw - inset) * 2);
    const h = Math.max(1, (hh - inset) * 2);
    const x = cx - w/2, y = cy - h/2;
    c.beginPath();
    if(state.shape === 'circle'){
      c.arc(cx, cy, Math.max(1, hw - inset), 0, Math.PI*2);
      return;
    }
    let rr;
    if(state.shape === 'hbar' || state.shape === 'vbar') rr = Math.min(w,h) * 0.18;
    else rr = Math.min(w,h) * 0.28;
    rr = Math.max(1, Math.min(rr, w/2, h/2));
    if(c.roundRect){
      c.roundRect(x, y, w, h, rr);
    } else {
      c.moveTo(x+rr, y);
      c.lineTo(x+w-rr, y); c.quadraticCurveTo(x+w,y,x+w,y+rr);
      c.lineTo(x+w, y+h-rr); c.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
      c.lineTo(x+rr, y+h); c.quadraticCurveTo(x,y+h,x,y+h-rr);
      c.lineTo(x, y+rr); c.quadraticCurveTo(x,y,x+rr,y);
      c.closePath();
    }
  }

  function rebuildLens(){
    if(!img) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    finalCv.width = w; finalCv.height = h;
    const c = finalCv.getContext('2d');
    c.drawImage(base,0,0);
    const scale = w / 1200;
    const r = (state.size / 100) * w / 2;
    const dim = lensDims(r, w, h);
    const hw = dim.hw, hh = dim.hh;
    const bw = state.borderWidth * scale;
    const cx = lx * w, cy = ly * h;
    const sw = hw / state.zoom, sh = hh / state.zoom;

    // soft drop shadow under the lens
    c.save();
    c.shadowColor = 'rgba(15,23,42,.38)';
    c.shadowBlur = 18 * scale;
    c.shadowOffsetY = 6 * scale;
    c.fillStyle = 'rgba(255,255,255,.5)';
    lensPath(c,cx,cy,hw,hh,0); c.fill();
    c.restore();

    // zoomed content
    c.save();
    lensPath(c,cx,cy,hw,hh,0); c.clip();
    c.drawImage(img,0,0,w,h);
    c.drawImage(img, cx-sw, cy-sh, sw*2, sh*2, cx-hw, cy-hh, hw*2, hh*2);
    const g = c.createLinearGradient(cx-hw,cy-hh,cx+hw,cy+hh);
    g.addColorStop(0,'rgba(255,255,255,.16)');
    g.addColorStop(.45,'rgba(255,255,255,0)');
    g.addColorStop(1,'rgba(255,255,255,.06)');
    c.fillStyle = g;
    c.fillRect(cx-hw,cy-hh,hw*2,hh*2);
    c.restore();

    if(bw > 0){
      c.save();
      c.strokeStyle = state.borderColor;
      c.lineWidth = bw;
      c.lineJoin = 'round';
      lensPath(c,cx,cy,hw,hh,bw/2);
      c.stroke();
      c.restore();
    }
    renderDisplay();
  }

  function renderDisplay(){
    if(!img) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    const maxW = Math.max(120, stage.clientWidth - 72);
    const maxH = Math.max(120, stage.clientHeight - 72);
    const s = Math.min(maxW/w, maxH/h, 1);
    const dw = Math.max(1, Math.round(w*s)), dh = Math.max(1, Math.round(h*s));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.style.width = dw + 'px'; view.style.height = dh + 'px';
    view.width = Math.round(dw*dpr); view.height = Math.round(dh*dpr);
    const c = view.getContext('2d');
    c.setTransform(dpr,0,0,dpr,0,0);
    c.clearRect(0,0,dw,dh);
    c.drawImage(finalCv,0,0,dw,dh);
    view.hidden = false;
  }

  /* ---------- loading ---------- */
  function loadBlob(blob, name){
    if(!blob || !blob.type || blob.type.indexOf('image/') !== 0){
      toast('请选择图片文件');
      return;
    }
    if(imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = function(){
      img = im; lx = 0.5; ly = 0.5;
      rebuildBase(); rebuildLens();
      $('empty').style.display = 'none';
      $('fileInfo').innerHTML = '<strong>' + escapeHtml(name || '剪贴板图片') + '</strong><span>' + im.naturalWidth + ' × ' + im.naturalHeight + ' 像素</span>';
      $('statusText').textContent = '图片已载入';
      $('dot').classList.add('on');
      toast('图片已载入');
    };
    im.onerror = function(){ toast('图片读取失败，请换一张试试'); };
    im.src = imgUrl;
  }

  /* ---------- controls ---------- */
  function bindRange(id, key, outId, fmt, baseChange){
    const el = $(id);
    el.addEventListener('input', function(){
      state[key] = Number(el.value);
      $(outId).textContent = fmt(state[key]);
      if(baseChange) rebuildBase();
      if(img) rebuildLens();
    });
  }
  bindRange('size','size','sizeVal', v => v + '%', false);
  bindRange('zoom','zoom','zoomVal', v => v.toFixed(1) + '×', false);
  bindRange('blur','blur','blurVal', v => String(v), true);
  bindRange('tintOpacity','tintOpacity','tintOpacityVal', v => v + '%', true);
  bindRange('borderWidth','borderWidth','borderWidthVal', v => String(v), false);

  $('tint').addEventListener('input', function(e){
    state.tint = e.target.value;
    $('tintCode').textContent = state.tint.toUpperCase();
    rebuildBase(); if(img) rebuildLens();
  });
  $('borderColor').addEventListener('input', function(e){
    state.borderColor = e.target.value;
    $('borderCode').textContent = state.borderColor.toUpperCase();
    if(img) rebuildLens();
  });
  document.querySelectorAll('[data-shape]').forEach(function(btn){
    btn.addEventListener('click', function(){
      state.shape = btn.dataset.shape;
      document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('active', b === btn));
      if(img) rebuildLens();
    });
  });
  $('resetBtn').addEventListener('click', function(){
    Object.assign(state, DEFAULTS);
    $('size').value = state.size; $('sizeVal').textContent = state.size + '%';
    $('zoom').value = state.zoom; $('zoomVal').textContent = state.zoom.toFixed(1) + '×';
    $('blur').value = state.blur; $('blurVal').textContent = state.blur;
    $('tint').value = state.tint; $('tintCode').textContent = state.tint.toUpperCase();
    $('tintOpacity').value = state.tintOpacity; $('tintOpacityVal').textContent = state.tintOpacity + '%';
    $('borderColor').value = state.borderColor; $('borderCode').textContent = state.borderColor.toUpperCase();
    $('borderWidth').value = state.borderWidth; $('borderWidthVal').textContent = state.borderWidth;
    document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('active', b.dataset.shape === state.shape));
    rebuildBase(); if(img) rebuildLens();
    toast('已恢复默认设置');
  });

  /* ---------- input events ---------- */
  $('pickBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', function(e){
    const f = e.target.files && e.target.files[0];
    if(f) loadBlob(f, f.name);
    e.target.value = '';
  });
  $('pasteBtn').addEventListener('click', async function(){
    try{
      const items = await navigator.clipboard.read();
      for(const item of items){
        const type = item.types.find(t => t.indexOf('image/') === 0);
        if(type){ loadBlob(await item.getType(type), '剪贴板图片'); return; }
      }
      toast('剪贴板中没有图片，可按 Ctrl+V 粘贴');
    }catch(err){
      toast('无法读取剪贴板，请按 Ctrl+V 粘贴图片');
    }
  });
  document.addEventListener('paste', function(e){
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    for(const item of items){
      if(item.type.indexOf('image/') === 0){
        const f = item.getAsFile();
        if(f){ e.preventDefault(); loadBlob(f, '剪贴板图片'); }
        return;
      }
    }
  });
  ['dragenter','dragover'].forEach(function(t){
    stage.addEventListener(t, function(e){ e.preventDefault(); stage.classList.add('dragging'); });
  });
  ['dragleave','drop'].forEach(function(t){
    stage.addEventListener(t, function(e){ e.preventDefault(); stage.classList.remove('dragging'); });
  });
  stage.addEventListener('drop', function(e){
    const files = e.dataTransfer && e.dataTransfer.files;
    const f = files && Array.prototype.find.call(files, x => x.type.indexOf('image/') === 0);
    if(f) loadBlob(f, f.name); else toast('请拖入图片文件');
  });

  function setLensFromEvent(e){
    const rect = view.getBoundingClientRect();
    lx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    ly = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    rebuildLens();
  }
  view.addEventListener('pointerdown', function(e){
    if(!img) return;
    dragging = true;
    try{ view.setPointerCapture(e.pointerId); }catch(err){}
    setLensFromEvent(e);
  });
  view.addEventListener('pointermove', function(e){ if(dragging) setLensFromEvent(e); });
  view.addEventListener('pointerup', function(e){
    dragging = false;
    try{ view.releasePointerCapture(e.pointerId); }catch(err){}
  });
  view.addEventListener('pointercancel', function(){ dragging = false; });

  $('exportBtn').addEventListener('click', function(){
    if(!img){ toast('请先载入一张图片'); return; }
    finalCv.toBlob(function(blob){
      if(!blob){ toast('导出失败，请重试'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '放大镜效果-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('已导出 PNG 图片');
    }, 'image/png');
  });

  new ResizeObserver(function(){ if(img) renderDisplay(); }).observe(stage);
})();
