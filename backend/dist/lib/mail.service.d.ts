export declare class MailService {
    private transporter;
    constructor();
    private formatRupiah;
    private generateTemplate;
    sendEmail({ to, subject, title, message, orderDetail }: any): Promise<boolean>;
}
