public class Immagine extends ContenutoStampabile {

    private int larghezza;
    private int altezza;

    public Immagine(String nome, String descrizione, int larghezza, int altezza) {
        super(nome, descrizione);
        this.larghezza = larghezza;
        this.altezza = altezza;
    }

    @Override
    public String stampa() {
        return "Stampa IMMAGINE -> " + toString() +
                ", larghezza=" + larghezza +
                ", altezza=" + altezza;
    }
}
