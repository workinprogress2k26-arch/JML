public class Main {

    public static void main(String[] args) {

        Archivio archivio = new Archivio(4);

        archivio.aggiungi(new Audio("Musica", "Rock"));
        archivio.aggiungi(new Video("Film", "Drammatico"));
        archivio.aggiungi(new Immagine("Foto", "Panorama", 800, 600));
        archivio.aggiungi(new DocumentoTesto("Tesina", "Scuola", "Arial"));

        System.out.println(archivio.eseguiTutti());
    }
}
