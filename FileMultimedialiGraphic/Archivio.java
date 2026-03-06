public class Archivio {

    private Contenuto[] contenuti;
    private int indice;

    public Archivio(int dimensione) {
        contenuti = new Contenuto[dimensione];
        indice = 0;
    }

    public void aggiungi(Contenuto c) {
        if (indice < contenuti.length) {
            contenuti[indice++] = c;
        }
    }

    public String eseguiTutti() {
        String risultato = "";
        for (int i = 0; i < indice; i++) {
            risultato += contenuti[i].esegui() + "\n";
        }
        return risultato;
    }
}
