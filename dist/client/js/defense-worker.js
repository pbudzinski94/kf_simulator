importScripts('dice.js', 'defense-engine.js');
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,result:KF.defense.calculate(data.config)}); }
  catch(error) { self.postMessage({id:data.id,error:error.message}); }
};
