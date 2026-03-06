public class DocumentoTesto extends ContenutoStampabile {

    private String font;

    public DocumentoTesto(String nome, String descrizione, String font) {
        super(nome, descrizione);
        this.font = font;
    }

    @Override
    public String stampa() {
        return "Stampa DOCUMENTO -> " + toString() +
                ", font=" + font;
    }
}
