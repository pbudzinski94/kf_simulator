(function (root) {
  'use strict';

  const face = (power, breakSymbols, hopeSymbols, label) =>
    Object.freeze({ power, break: breakSymbols, hope: hopeSymbols, label });

  // "power" below represents Attack symbols printed on a Power Die.
  // The UI calls them base Power to distinguish them from Attack Roll d10s.
  const POWER_DICE = Object.freeze({
    red: Object.freeze([
      face(0, 0, 1, '1 Hope'),
      face(2, 0, 1, '2 Moc · 1 Hope'),
      face(0, 1, 0, '1 Break'),
      face(1, 0, 0, '1 Moc'),
      face(1, 1, 0, '1 Moc · 1 Break'),
      face(1, 1, 0, '1 Moc · 1 Break')
    ]),
    black: Object.freeze([
      face(2, 0, 1, '2 Moc · 1 Hope'),
      face(0, 1, 1, '1 Break · 1 Hope'),
      face(1, 1, 0, '1 Moc · 1 Break'),
      face(2, 2, 0, '2 Moc · 2 Break'),
      face(2, 2, 1, '2 Moc · 2 Break · 1 Hope'),
      face(1, 1, 0, '1 Moc · 1 Break')
    ]),
    white: Object.freeze([
      face(1, 3, 0, '1 Moc · 3 Break'),
      face(3, 2, 1, '3 Moc · 2 Break · 1 Hope'),
      face(1, 2, 1, '1 Moc · 2 Break · 1 Hope'),
      face(2, 3, 0, '2 Moc · 3 Break'),
      face(1, 1, 1, '1 Moc · 1 Break · 1 Hope'),
      face(2, 1, 1, '2 Moc · 1 Break · 1 Hope')
    ])
  });

  root.KF = root.KF || {};
  root.KF.POWER_DICE = POWER_DICE;
})(typeof globalThis !== 'undefined' ? globalThis : window);
