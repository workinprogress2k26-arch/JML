public abstract class Contenuto {

    protected int codice;
    protected String nome;
    protected String descrizione;
    private static int contatore = 1;

    public Contenuto(String nome, String descrizione) {
        this.codice = contatore++;
        this.nome = nome;
        this.descrizione = descrizione;
    }

    public int getCodice() {
        return codice;
    }

    public abstract String esegui();

    @Override
    public String toString() {
        return "codice=" + codice +
                ", nome=" + nome +
                ", descrizione=" + descrizione;
    }
}
