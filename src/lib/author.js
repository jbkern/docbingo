/* Nom de l'auteur, encodé pour ne pas apparaître en clair dans les fichiers servis
   (protection contre la collecte automatisée par robots ; décodé uniquement à l'affichage
   des pages juridiques). Le token §A§ des textes est remplacé à l'affichage. */
export const AUTHOR = typeof atob === 'function' ? atob('SmVhbi1CYXB0aXN0ZSBLZXJu') : 'l\'auteur';
export const withAuthor = (s) => String(s ?? '').replace(/§A§/g, AUTHOR);
