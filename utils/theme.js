const PALETTES = {
  dark: {
    navFront: '#ffffff',
    navBg: '#0B0D10',
    tabColor: '#7D8592',
    tabSelected: '#C7FF3D',
    tabBg: '#0B0D10',
    tabBorder: 'black'
  },
  light: {
    navFront: '#000000',
    navBg: '#F3F5F8',
    tabColor: '#737C89',
    tabSelected: '#3D6B00',
    tabBg: '#FFFFFF',
    tabBorder: 'white'
  }
};

function resolveTheme(preference) {
  if (preference === 'dark' || preference === 'light') return preference;
  try {
    const info = wx.getSystemInfoSync();
    return info.theme === 'light' ? 'light' : 'dark';
  } catch (e) {
    return 'dark';
  }
}

function getPalette(themeName) {
  return PALETTES[themeName] || PALETTES.dark;
}

module.exports = {
  resolveTheme,
  getPalette
};
