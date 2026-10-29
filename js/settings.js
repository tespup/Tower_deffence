/* ============ SETTINGS: звук, качество, вибрация ============ */
(function (GD) {
  'use strict';
  const KEY = 'sktd_set_v1';
  const VOL = [.4, 1, 1.7];          /* тихо / норм / громко (множитель базовой громкости) */
  const VOL_NAMES = ['ТИХО', 'НОРМА', 'ГРОМКО'];
  const Q_NAMES = ['АВТО', 'ВЫСОКОЕ', 'НИЗКОЕ'];

  const S = {
    sound: true, vol: 1, quality: 0, haptic: true,
    VOL, VOL_NAMES, Q_NAMES,

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw) || {};
          if (typeof d.sound === 'boolean') this.sound = d.sound;
          if (d.vol >= 0 && d.vol <= 2) this.vol = d.vol | 0;
          if (d.quality >= 0 && d.quality <= 2) this.quality = d.quality | 0;
          if (typeof d.haptic === 'boolean') this.haptic = d.haptic;
        } else if (localStorage.getItem('sktd_mute') === '1') this.sound = false; /* старый ключ */
      } catch (e) { }
      this.apply();
    },
    save() {
      const d = JSON.stringify({ sound: this.sound, vol: this.vol, quality: this.quality, haptic: this.haptic });
      try { localStorage.setItem(KEY, d); } catch (e) { }
      if (GD.TG && GD.TG.save) { try { GD.TG.save(KEY, JSON.parse(d)); } catch (e) { } }
    },
    apply() {
      GD.Audio.setMuted(!this.sound);
      GD.Audio.setVolume(VOL[this.vol] == null ? 1 : VOL[this.vol]);
      const b = document.getElementById('btnSound');
      if (b) b.classList.toggle('on', this.sound);
      this.applyQuality();
    },
    applyQuality() {
      if (GD.setQuality) GD.setQuality(this.quality);
    },
    /* циклическая смена значения из пункта меню */
    cycle(what) {
      if (what === 'vol') this.vol = (this.vol + 1) % 3;
      else if (what === 'quality') this.quality = (this.quality + 1) % 3;
      else if (what === 'sound') this.sound = !this.sound;
      else if (what === 'haptic') this.haptic = !this.haptic;
      this.save(); this.apply();
      GD.Audio.SFX.place();
    }
  };
  GD.Settings = S;
})(window.GD);
