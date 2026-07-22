// Type declarations for CSS side-effect imports used by the Expo template
// (global.css, *.module.css). Metro/Expo handle these at bundle time; this just
// keeps `tsc --noEmit` happy.
declare module '*.css';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
